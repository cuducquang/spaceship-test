"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BookOpenText,
  Boxes,
  ChevronDown,
  FlaskConical,
  ImageIcon,
  LineChart,
  NotebookPen,
  TrendingUp,
} from "lucide-react";
import type { ToolUiPayload } from "@/lib/agent/events";
import type { ForecastResult } from "@/lib/analytics/forecast";
import { DynamicChart } from "@/components/charts/dynamic-chart";
import { cn, formatValue } from "@/lib/utils";
import { canvasKindOf, canvasTitleOf, useCanvas } from "./canvas-context";
import { DataTable } from "./data-table";
import { ExplainPanel } from "./explain-panel";
import { Markdown } from "./markdown";

/* ------------------------------------------------------------------ */
/* forecast block                                                       */
/* ------------------------------------------------------------------ */

export function monthShort(m: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
}

/** History + forecast + uncertainty band — shared by the chat block, the canvas and the Forecast page. */
export function ForecastSeriesChart({
  result,
  height = 260,
}: {
  result: ForecastResult;
  height?: number;
}) {
  const data = result.series.map((p) => ({
    ...p,
    band: p.lower !== null && p.upper !== null ? [p.lower, p.upper] : undefined,
    label: monthShort(p.month),
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 4, right: 16 }}>
        <defs>
          <linearGradient id="fc-band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={14} />
        <YAxis axisLine={false} tickLine={false} width={46} />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            fontSize: 12,
            boxShadow: "var(--shadow-lift)",
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span className="text-xs text-ink-2">{String(v)}</span>}
        />
        <Area
          dataKey="band"
          name="80% interval"
          stroke="none"
          fill="url(#fc-band)"
          connectNulls
          isAnimationActive={false}
          legendType="none"
        />
        <Line
          dataKey="actual"
          name="Actual"
          type="monotone"
          stroke="#0891b2"
          strokeWidth={2.4}
          dot={{ r: 2.5, strokeWidth: 0, fill: "#0891b2" }}
          connectNulls={false}
        />
        <Line
          dataKey="forecast"
          name="Forecast"
          type="monotone"
          stroke="#6366f1"
          strokeWidth={2.4}
          strokeDasharray="6 4"
          dot={{ r: 3, strokeWidth: 0, fill: "#6366f1" }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ForecastBlock({ result }: { result: ForecastResult }) {
  const [showMethod, setShowMethod] = useState(false);
  const metricLabel =
    result.metric === "quantity" ? "units" : result.metric === "revenue" ? "USD" : "orders";

  return (
    <div className="card block-enter mt-2 overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-[14px] font-semibold text-ink">
            Demand forecast: {result.target.used.value ?? "all orders"}{" "}
            <span className="font-normal text-ink-3">({metricLabel}/month)</span>
          </h4>
          <span className="tag border-violet/30 bg-violet/10 text-violet">
            {result.method_label}
          </span>
        </div>
        {result.target.fallback_reason && (
          <p className="mt-2 rounded-lg border border-warn/25 bg-warn/10 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-warn">
            {result.target.fallback_reason}
          </p>
        )}
      </div>

      <div className="px-2 pt-3">
        <ForecastSeriesChart result={result} height={260} />
      </div>

      {/* inventory recommendation */}
      <div className="mx-4 mb-3 mt-1 rounded-xl border border-brand-2/25 bg-brand-soft/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-brand">
          <Boxes size={13} />
          Inventory recommendation · {Math.round(result.inventory.service_level * 100)}% service
          level
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-panel/70 px-2 py-2">
            <div className="font-display text-[18px] font-bold text-ink">
              {formatValue(result.inventory.total_forecast_units, "number")}
            </div>
            <div className="text-[10.5px] text-ink-3">forecast {metricLabel}</div>
          </div>
          <div className="rounded-lg bg-panel/70 px-2 py-2">
            <div className="font-display text-[18px] font-bold text-ink">
              +{formatValue(result.inventory.safety_stock_units, "number")}/mo
            </div>
            <div className="text-[10.5px] text-ink-3">safety stock</div>
          </div>
          <div className="rounded-lg bg-panel/70 px-2 py-2">
            <div className="font-display text-[18px] font-bold text-brand">
              {formatValue(result.inventory.recommended_total_units, "number")}
            </div>
            <div className="text-[10.5px] text-ink-3">recommended stock</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {result.inventory.per_month.map((m) => (
            <span key={m.month} className="tag bg-panel/70">
              {monthShort(m.month)}: <strong>{m.recommended}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* methodology accordion */}
      <button
        onClick={() => setShowMethod(!showMethod)}
        className="flex w-full items-center justify-between border-t border-border px-4 py-2.5 text-[11.5px] font-semibold text-ink-2 transition-colors hover:bg-panel-2"
      >
        <span className="flex items-center gap-1.5">
          <FlaskConical size={12} className="text-violet" />
          Methodology & backtest
        </span>
        <ChevronDown size={13} className={cn("transition-transform", showMethod && "rotate-180")} />
      </button>
      {showMethod && (
        <div className="space-y-2.5 border-t border-border bg-panel-2/40 px-4 py-3 text-[12px] leading-relaxed text-ink-2">
          <p>{result.methodology}</p>
          {result.backtest.evaluated && (
            <div className="flex flex-wrap gap-1.5">
              {result.backtest.candidates.map((c) => (
                <span
                  key={c.method}
                  className={cn(
                    "tag",
                    c.method === result.method_used &&
                      "border-violet/40 bg-violet/10 font-bold text-violet",
                  )}
                >
                  {c.method.replace(/_/g, " ")} · MAE {c.mae}
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink-3">{result.plan}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* payload dispatcher                                                   */
/* ------------------------------------------------------------------ */

const CHIP_META = {
  chart: { label: "Chart", icon: LineChart, ring: "from-brand to-cyan" },
  forecast: { label: "Forecast", icon: TrendingUp, ring: "from-violet to-cyan" },
  image: { label: "Image", icon: ImageIcon, ring: "from-cyan to-violet" },
} as const;

/** Compact in-chat reference to a visualization living on the canvas. */
function CanvasChip({
  payload,
  payloadKey,
  onOpen,
}: {
  payload: ToolUiPayload;
  payloadKey: string;
  onOpen: (key: string) => void;
}) {
  const kind = canvasKindOf(payload);
  if (!kind) return null;
  const meta = CHIP_META[kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => onOpen(payloadKey)}
      className="card card-hover group/chip mt-2 flex w-full items-center gap-3 p-3 text-left"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
          meta.ring,
        )}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{canvasTitleOf(payload)}</div>
        <div className="text-[11px] text-ink-3">{meta.label} · rendered on the canvas</div>
      </div>
      <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[10.5px] font-bold text-brand opacity-80 transition-opacity group-hover/chip:opacity-100">
        View →
      </span>
    </button>
  );
}

export function PayloadBlock({
  payload,
  payloadKey,
}: {
  payload: ToolUiPayload;
  payloadKey?: string;
}) {
  const canvas = useCanvas();

  // Inside the chat workspace, visual payloads live on the right-hand canvas
  // and the message keeps a compact reference chip.
  if (canvas && payloadKey && canvasKindOf(payload)) {
    return <CanvasChip payload={payload} payloadKey={payloadKey} onOpen={canvas.focus} />;
  }

  switch (payload.kind) {
    case "query_result":
      return (
        <div className="mt-2">
          <DataTable
            columns={payload.result.columns.map((c) => ({
              key: c.key,
              label: c.label,
              format: c.format,
            }))}
            rows={payload.result.rows}
            maxHeight={260}
          />
          <ExplainPanel result={payload.result} sampleOrders={payload.sample_orders} />
        </div>
      );

    case "chart":
      return (
        <div className="card block-enter mt-2 p-4">
          <h4 className="font-display mb-1 text-[14px] font-semibold text-ink">
            {payload.chart.title}
          </h4>
          {payload.chart.subtitle && (
            <p className="mb-2 text-[11.5px] text-ink-3">{payload.chart.subtitle}</p>
          )}
          <DynamicChart chart={payload.chart} height={280} />
        </div>
      );

    case "forecast":
      return <ForecastBlock result={payload.result} />;

    case "image":
      return (
        <figure className="card block-enter mt-2 overflow-hidden">
          {payload.data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={payload.data_url} alt={payload.prompt} className="w-full" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 bg-panel-2 text-ink-3">
              <ImageIcon size={22} />
              <span className="text-[11.5px]">image not persisted in history</span>
            </div>
          )}
          <figcaption className="flex items-start gap-2 border-t border-border px-3.5 py-2.5 text-[11.5px] text-ink-3">
            <ImageIcon size={13} className="mt-0.5 shrink-0 text-violet" />
            <span>
              <span className="font-semibold text-ink-2">{payload.model}</span> · {payload.prompt}
            </span>
          </figcaption>
        </figure>
      );

    case "knowledge_write":
      return (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-good/30 bg-good/10 px-3 py-2.5 text-[12px] text-good">
          <NotebookPen size={13} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">
              Knowledge {payload.mode === "append" ? "added to" : "saved in"} {payload.path}
            </span>
            <div className="mt-0.5 [&_.prose-chat]:text-[12px] [&_.prose-chat]:!text-good/90">
              <Markdown>{payload.content}</Markdown>
            </div>
          </div>
        </div>
      );

    case "knowledge_read":
      return (
        <details className="mt-2 rounded-xl border border-border bg-panel-2/50 px-3 py-2 text-[12px]">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-ink-2">
            <BookOpenText size={13} className="text-brand" /> Read {payload.path}
          </summary>
          <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-panel px-3 py-2 [&_.prose-chat]:text-[12px]">
            <Markdown>{payload.content}</Markdown>
          </div>
        </details>
      );

    case "knowledge_list":
      return (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {payload.files.map((f) => (
            <span key={f.path} className="tag">
              <BookOpenText size={11} className="text-brand" /> {f.path}
            </span>
          ))}
        </div>
      );

    default:
      return null;
  }
}
