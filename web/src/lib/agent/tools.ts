import { z } from "zod";
import { applyFilters, resolveDateRange, runQuery } from "@/lib/analytics/engine";
import { runForecast } from "@/lib/analytics/forecast";
import {
  ChartSpecSchema,
  ForecastSpecSchema,
  QuerySpecSchema,
  type ResultColumn,
} from "@/lib/analytics/specs";
import type { Dataset } from "@/lib/data/types";
import {
  runBenchmark,
  type FeatureSpec,
  type ModelKind,
} from "@/lib/ml/engine";
import type { KnowledgeStore } from "./knowledge-store";
import type { ToolUiPayload } from "./events";
import { generateImage } from "./gemini";

/* ------------------------------------------------------------------ */
/* infrastructure                                                       */
/* ------------------------------------------------------------------ */

export interface StoredResult {
  columns: ResultColumn[];
  rows: Record<string, string | number | boolean | null>[];
  source: "query" | "forecast";
}

export interface ToolContext {
  dataset: Dataset;
  /** Results produced earlier in this turn, addressable by result_id. */
  results: Map<string, StoredResult>;
  knowledge: KnowledgeStore;
  /** Gemini model selected for image generation (footer setting). */
  imageModel?: string;
}

export interface ToolOutcome {
  /** Compact JSON the model sees (token-efficient, numbers pre-formatted). */
  modelResult: unknown;
  /** One-line human summary for the UI step timeline. */
  summary: string;
  /** Rich payload for the UI renderer (charts, tables, images …). */
  payload?: ToolUiPayload;
}

export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  execute(input: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}

function jsonSchemaFor(schema: z.ZodTypeAny): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export function toAnthropicTools(tools: AgentTool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: jsonSchemaFor(t.schema) as { type: "object"; [k: string]: unknown },
  }));
}

/** Format a metric value the way the UI will display it, so the model quotes identical numbers. */
function formatForModel(
  value: string | number | boolean | null,
  format: ResultColumn["format"],
): string | number | boolean | null {
  if (value === null || typeof value !== "number") return value;
  switch (format) {
    case "percent":
      return `${Math.round(value * 1000) / 10}%`;
    case "currency":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    case "days":
      return `${Math.round(value * 100) / 100} days`;
    default:
      return value;
  }
}

/* ------------------------------------------------------------------ */
/* analytics tools                                                      */
/* ------------------------------------------------------------------ */

const MODEL_ROW_CAP = 30;

const queryOrdersTool: AgentTool = {
  name: "query_orders",
  description:
    "Run a validated aggregation over the logistics orders dataset (the ONLY source of truth for numbers). Call this whenever the user asks for any count, rate, average, revenue, ranking, breakdown or trend — never answer from memory. Returns aggregated rows plus a result_id you can pass to create_chart. Prefer relative_window for phrases like 'last 3 months' (it anchors to the dataset's latest date, 2025-12-30). Use at most 2 dimensions; use 'date:week' or 'date:month' for trends.",
  schema: QuerySpecSchema,
  async execute(input, ctx) {
    const spec = QuerySpecSchema.parse(input);
    const opts = {
      datasetMinDate: ctx.dataset.info.dateRange.from,
      datasetMaxDate: ctx.dataset.info.dateRange.to,
    };
    const result = runQuery(ctx.dataset.orders, spec, opts);
    ctx.results.set(result.meta.result_id, {
      columns: result.columns,
      rows: result.rows,
      source: "query",
    });

    // raw sample for the explainability "underlying data" view
    const resolvedRange = resolveDateRange(spec.filters, opts.datasetMaxDate, opts.datasetMinDate);
    const { matched } = applyFilters(ctx.dataset.orders, spec.filters, resolvedRange);
    const sample = matched.slice(0, 25).map((o) => ({
      order_id: o.order_id,
      order_date: o.order_date,
      delivery_date: o.delivery_date,
      status: o.status,
      carrier: o.carrier,
      region: o.region,
      product_category: o.product_category,
      quantity: o.quantity,
      order_value_usd: o.order_value_usd,
      destination_city: o.destination_city,
    }));

    const formattedRows = result.rows.slice(0, MODEL_ROW_CAP).map((row) => {
      const out: Record<string, string | number | boolean | null> = {};
      for (const col of result.columns) out[col.key] = formatForModel(row[col.key], col.format);
      return out;
    });

    // Pre-computed totals over ALL rows for additive metrics, so the model
    // never sums rows itself (LLM arithmetic is not allowed to touch numbers).
    const ADDITIVE = new Set([
      "order_count",
      "delivered_count",
      "delayed_count",
      "exception_count",
      "in_transit_count",
      "canceled_count",
      "completed_count",
      "late_count",
      "total_quantity",
      "total_revenue",
      "promo_order_count",
    ]);
    let totals: Record<string, string | number | boolean | null> | undefined;
    if ((spec.dimensions?.length ?? 0) > 0) {
      totals = {};
      for (const m of spec.metrics) {
        if (!ADDITIVE.has(m)) continue;
        const sum = result.rows.reduce(
          (acc, r) => acc + (typeof r[m] === "number" ? (r[m] as number) : 0),
          0,
        );
        const fmt = result.columns.find((c) => c.key === m)?.format ?? "number";
        totals[m] = formatForModel(Math.round(sum * 100) / 100, fmt);
      }
      if (Object.keys(totals).length === 0) totals = undefined;
    }

    return {
      modelResult: {
        result_id: result.meta.result_id,
        plan: result.meta.plan,
        resolved_date_range: result.meta.resolved_date_range,
        applied_filters: result.meta.applied_filters,
        matched_orders: result.meta.matched_orders,
        row_count: result.meta.row_count,
        definitions_note: result.meta.definitions_note,
        columns: result.columns.map((c) => ({ key: c.key, label: c.label })),
        rows: formattedRows,
        totals: totals
          ? { ...totals, note: "exact totals across ALL rows — quote these, never sum rows yourself" }
          : undefined,
        truncated:
          result.rows.length > MODEL_ROW_CAP
            ? `showing ${MODEL_ROW_CAP} of ${result.rows.length} rows — the user sees the full table`
            : undefined,
      },
      summary: `${result.meta.matched_orders} orders matched → ${result.meta.row_count} row(s)`,
      payload: { kind: "query_result", result, sample_orders: sample },
    };
  },
};

const forecastTool: AgentTool = {
  name: "forecast_demand",
  description:
    "Forecast future monthly demand (units, orders or revenue) from historical data using moving average, linear regression or exponential smoothing — 'auto' backtests all three and picks the lowest-MAE method. Call this for any prediction, 'next N months', or inventory-planning question. Note: individual SKUs appear in ≤3 orders, so SKU-level requests automatically fall back to the SKU's product category (the result explains this). Returns forecast values, an uncertainty band, an inventory recommendation at 95% service level, and a result_id usable with create_chart.",
  schema: ForecastSpecSchema,
  async execute(input, ctx) {
    const spec = ForecastSpecSchema.parse(input);
    const result = runForecast(ctx.dataset.orders, spec);
    ctx.results.set(result.result_id, {
      columns: [
        { key: "month", label: "Month", kind: "dimension", format: "text" },
        { key: "actual", label: "Actual", kind: "metric", format: "number" },
        { key: "forecast", label: "Forecast", kind: "metric", format: "number" },
        { key: "lower", label: "Lower (80%)", kind: "metric", format: "number" },
        { key: "upper", label: "Upper (80%)", kind: "metric", format: "number" },
      ],
      rows: result.series.map((p) => ({ ...p })),
      source: "forecast",
    });
    return {
      modelResult: {
        result_id: result.result_id,
        target: result.target,
        metric: result.metric,
        method_used: result.method_label,
        params: result.params,
        backtest: result.backtest,
        history: result.history,
        forecast: result.series
          .filter((p) => p.actual === null)
          .map((p) => ({ month: p.month, forecast: p.forecast, lower: p.lower, upper: p.upper })),
        inventory: result.inventory,
        methodology: result.methodology,
        note: "A forecast visualization (history + forecast + band) is already displayed to the user.",
      },
      summary: `${result.method_label} · ${result.inventory.horizon_months}mo horizon · target ${result.target.used.level}${result.target.used.value ? `=${result.target.used.value}` : ""}`,
      payload: { kind: "forecast", result },
    };
  },
};

const createChartTool: AgentTool = {
  name: "create_chart",
  description:
    "Render an interactive chart for the user from a result produced earlier in this conversation turn (pass the result_id from query_orders or forecast_demand). Call this whenever a visual would help — trends over time (line/area), comparisons across categories (bar; horizontal_bar when >6 groups), composition shares (donut, ≤6 slices), on-time-vs-delayed mixes (stacked_bar), or a count plus a rate together (combo with line_series). Choose 'x' and 'series' from the result's column keys. Do NOT call this for forecasts — forecast_demand already renders its own visualization.",
  schema: ChartSpecSchema,
  async execute(input, ctx) {
    const spec = ChartSpecSchema.parse(input);
    const stored = ctx.results.get(spec.result_id);
    if (!stored) {
      const available = [...ctx.results.keys()];
      throw new Error(
        `Unknown result_id "${spec.result_id}". Available in this turn: ${available.length > 0 ? available.join(", ") : "none — call query_orders first"}.`,
      );
    }
    const colKeys = stored.columns.map((c) => c.key);
    for (const key of [spec.x, ...spec.series, ...(spec.line_series ?? [])]) {
      if (!colKeys.includes(key)) {
        throw new Error(
          `Column "${key}" does not exist in result ${spec.result_id}. Available columns: ${colKeys.join(", ")}.`,
        );
      }
    }
    const keep = new Set([spec.x, ...spec.series, ...(spec.line_series ?? [])]);
    const rows = stored.rows.slice(0, 400).map((r) => {
      const out: Record<string, string | number | boolean | null> = {};
      for (const k of keep) out[k] = r[k];
      return out;
    });
    return {
      modelResult: {
        ok: true,
        rendered: spec.type,
        title: spec.title,
        points: rows.length,
        note: "Chart is now displayed to the user — describe the takeaway in one or two sentences, do not repeat every value.",
      },
      summary: `${spec.type} · “${spec.title}” · ${rows.length} points`,
      payload: {
        kind: "chart",
        chart: {
          type: spec.type,
          title: spec.title,
          subtitle: spec.subtitle,
          x: spec.x,
          series: spec.series,
          line_series: spec.line_series,
          value_format: spec.value_format,
          columns: stored.columns.map((c) => ({ key: c.key, label: c.label })),
          rows,
        },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* ML benchmark (live classifier evaluation)                            */
/* ------------------------------------------------------------------ */

const ML_PRESET_FEATURES: FeatureSpec[] = [
  { name: "carrier", kind: "categorical" },
  { name: "region", kind: "categorical" },
  { name: "warehouse", kind: "categorical" },
  { name: "product_category", kind: "categorical" },
  { name: "order_month", kind: "categorical" },
  { name: "quantity", kind: "numeric" },
  { name: "unit_price_usd", kind: "numeric" },
  { name: "is_promo", kind: "categorical" },
];

const evaluateMlSchema = z.strictObject({
  models: z
    .array(z.enum(["dummy", "logreg", "nb", "tree", "forest", "knn"]))
    .min(1)
    .max(6)
    .default(["dummy", "logreg", "nb", "tree", "forest", "knn"])
    .describe(
      "Classifiers to benchmark: dummy = class-prior baseline, logreg = logistic regression, nb = Gaussian naive Bayes, tree = CART decision tree, forest = random forest (bagged CART, √d feature subspace), knn = k-nearest neighbors. Default: all six.",
    ),
  folds: z
    .number()
    .int()
    .min(3)
    .max(10)
    .default(5)
    .describe("Stratified cross-validation folds (default 5)."),
});

const evaluateMlTool: AgentTool = {
  name: "evaluate_ml_models",
  description:
    "Train and benchmark late-delivery classifiers LIVE on the completed orders (baseline prior, logistic regression, naive Bayes, CART decision tree, random forest, k-nearest neighbors) using leakage-safe stratified cross-validation with order-time features only. Returns ROC-AUC, accuracy and F1 per model plus an honest deployability verdict, and renders a comparison chart. Call when the user asks whether machine learning can predict late deliveries, how the classifiers perform, or to rerun the model benchmark. The pre-registered offline study found NO deployable signal (logistic regression AUC 0.465, permutation p = 0.68) — use this tool to demonstrate that with live numbers; NEVER fabricate per-order risk predictions from these models.",
  schema: evaluateMlSchema,
  async execute(input, ctx) {
    const { models, folds } = evaluateMlSchema.parse(input);
    const rows = ctx.dataset.orders
      .filter((o) => o.is_completed)
      .map((o) => ({
        carrier: o.carrier,
        region: o.region,
        warehouse: o.warehouse,
        product_category: o.product_category,
        order_month: o.order_month.slice(5, 7),
        quantity: o.quantity,
        unit_price_usd: o.unit_price_usd,
        is_promo: o.is_promo ? "promo" : "standard",
        outcome: o.is_late ? "late" : "on_time",
      }));
    const bench = runBenchmark({
      rows,
      target: "outcome",
      positive: "late",
      features: ML_PRESET_FEATURES,
      models: models as ModelKind[],
      folds,
    });
    const ranked = [...bench.results].sort((a, b) => b.auc_mean - a.auc_mean);
    const best = ranked.find((r) => r.model !== "dummy") ?? ranked[0];
    const r3 = (x: number) => Number(x.toFixed(3));
    const deployable = best.auc_mean >= 0.65;
    const chartRows = ranked.map((r) => ({
      model: r.label,
      auc: r3(r.auc_mean),
      f1: r3(r.f1),
    }));
    return {
      modelResult: {
        n: bench.n,
        positives: bench.positives,
        positive_rate: r3(bench.baseline_rate),
        folds: bench.folds,
        features: bench.feature_count,
        encoded_dims: bench.encoded_dims,
        leaderboard: ranked.map((r) => ({
          model: r.label,
          auc_mean: r3(r.auc_mean),
          auc_std: r3(r.auc_std),
          accuracy: r3(r.accuracy),
          f1: r3(r.f1),
        })),
        verdict: deployable
          ? `possible signal — best model ${best.label} reaches CV AUC ${r3(best.auc_mean)}; a permutation test is still required before trusting it`
          : `no deployable signal — best model ${best.label} reaches CV AUC ${r3(best.auc_mean)} vs the 0.65 bar, consistent with the offline study's pre-registered no-ship decision`,
        guidance:
          "AUC near 0.5 means order-time features carry no predictive signal for late delivery. Recommend operational analysis (carrier/region delay rates, root causes) instead of per-order risk scores. A comparison chart is already displayed to the user.",
      },
      summary: `${ranked.length} models · ${bench.folds}-fold CV · best ${best.label} AUC ${r3(best.auc_mean)}`,
      payload: {
        kind: "chart",
        chart: {
          type: "bar",
          title: "Classifier benchmark — late vs on time",
          subtitle: `${bench.n} completed orders · ${bench.folds} fold stratified CV · leakage safe`,
          x: "model",
          series: ["auc", "f1"],
          value_format: "number",
          columns: [
            { key: "model", label: "Model" },
            { key: "auc", label: "ROC-AUC (CV mean)" },
            { key: "f1", label: "F1 @0.5" },
          ],
          rows: chartRows,
        },
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* image generation                                                     */
/* ------------------------------------------------------------------ */

const generateImageSchema = z.strictObject({
  prompt: z
    .string()
    .min(5)
    .max(2000)
    .describe(
      "Detailed visual description. Include style, composition, palette and any text to render.",
    ),
  aspect_ratio: z.enum(["1:1", "16:9", "4:3", "3:2", "9:16"]).default("16:9"),
});

const generateImageTool: AgentTool = {
  name: "generate_image",
  description:
    "Generate a high-quality illustration with Gemini (e.g. a report cover, an executive-summary hero visual, a concept illustration for a logistics initiative). Call this ONLY when the user asks for an image/visual asset/illustration, or accepts your offer of one — never for data charts (use create_chart). Ground the prompt in real findings from this conversation when relevant.",
  schema: generateImageSchema,
  async execute(input, ctx) {
    const { prompt, aspect_ratio } = generateImageSchema.parse(input);
    const image = await generateImage(prompt, aspect_ratio, ctx.imageModel);
    return {
      modelResult: {
        ok: true,
        model: image.model,
        note: "Image generated and displayed to the user.",
      },
      summary: `image via ${image.model} (${aspect_ratio})`,
      payload: {
        kind: "image",
        data_url: image.dataUrl,
        prompt,
        model: image.model,
        aspect_ratio,
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* knowledge filesystem tools                                           */
/* ------------------------------------------------------------------ */

const knowledgeListTool: AgentTool = {
  name: "knowledge_list",
  description:
    "List the markdown files in your persistent knowledge base (path, size, last update, preview). Call when you need to check what you already know beyond the files named in the system prompt.",
  schema: z.strictObject({}),
  async execute(_input, ctx) {
    const files = await ctx.knowledge.list();
    return {
      modelResult: { files },
      summary: `${files.length} knowledge file(s)`,
      payload: {
        kind: "knowledge_list",
        files: files.map((f) => ({ path: f.path, bytes: f.bytes, updated_at: f.updated_at })),
      },
    };
  },
};

const knowledgeReadSchema = z.strictObject({
  path: z.string().describe("File name, e.g. insights.md"),
});

const knowledgeReadTool: AgentTool = {
  name: "knowledge_read",
  description:
    "Read one knowledge file in full. Call before answering when a file's preview suggests it holds relevant context (e.g. user-preferences.md at the start of a conversation, insights.md before re-deriving known findings).",
  schema: knowledgeReadSchema,
  async execute(input, ctx) {
    const { path } = knowledgeReadSchema.parse(input);
    if (path.startsWith("_")) {
      throw new Error(`Paths starting with "_" are reserved for app internals.`);
    }
    const content = await ctx.knowledge.read(path);
    if (content === null) {
      const files = await ctx.knowledge.list();
      throw new Error(
        `Knowledge file "${path}" not found. Available: ${files.map((f) => f.path).join(", ")}`,
      );
    }
    return {
      modelResult: { path, content: content.slice(0, 8000) },
      summary: `read ${path}`,
      payload: { kind: "knowledge_read", path, content },
    };
  },
};

const knowledgeWriteSchema = z.strictObject({
  path: z
    .string()
    .describe("File name ending in .md — append to insights.md / user-preferences.md, or create a new topical file."),
  content: z.string().min(1).max(4000),
  mode: z
    .enum(["append", "replace"])
    .default("append")
    .describe("append adds to the end (preferred for logs); replace overwrites the whole file."),
});

const knowledgeWriteTool: AgentTool = {
  name: "knowledge_write",
  description:
    "Persist knowledge so it survives this conversation: durable insights (append one concise bullet to insights.md), stated user preferences (append to user-preferences.md), or new reference notes. Call after a notable finding or when the user expresses a lasting preference. Keep entries short — one or two lines.",
  schema: knowledgeWriteSchema,
  async execute(input, ctx) {
    const { path, content, mode } = knowledgeWriteSchema.parse(input);
    if (path.startsWith("_")) {
      throw new Error(`Paths starting with "_" are reserved for app internals.`);
    }
    await ctx.knowledge.write(path, content, mode);
    return {
      modelResult: { ok: true, path, mode },
      summary: `${mode} → ${path}`,
      payload: { kind: "knowledge_write", path, mode, content },
    };
  },
};

/* ------------------------------------------------------------------ */
/* registry                                                             */
/* ------------------------------------------------------------------ */

export function buildToolRegistry(): AgentTool[] {
  return [
    queryOrdersTool,
    forecastTool,
    evaluateMlTool,
    createChartTool,
    generateImageTool,
    knowledgeListTool,
    knowledgeReadTool,
    knowledgeWriteTool,
  ];
}
