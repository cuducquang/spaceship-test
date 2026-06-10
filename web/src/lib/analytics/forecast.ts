import type { Order } from "@/lib/data/types";
import type { ForecastSpec } from "./specs";

/**
 * Deterministic forecasting engine.
 *
 * Methods are intentionally simple (the brief allows moving average, linear
 * regression, exponential smoothing): with 12 monthly observations per series,
 * anything fancier would be statistical theater. "auto" picks the method with
 * the lowest MAE on a 3-month holdout backtest.
 */

export interface ForecastPoint {
  month: string;
  actual: number | null;
  fitted: number | null;
  forecast: number | null;
  lower: number | null;
  upper: number | null;
}

export interface ForecastResult {
  result_id: string;
  target: {
    requested: { level: string; value?: string };
    used: { level: string; value?: string };
    fallback_reason?: string;
  };
  metric: ForecastSpec["metric"];
  method_used: string;
  method_label: string;
  params: Record<string, number>;
  series: ForecastPoint[];
  backtest: {
    evaluated: boolean;
    holdout_months: number;
    candidates: { method: string; mae: number | null }[];
    note: string;
  };
  inventory: {
    horizon_months: number;
    total_forecast_units: number;
    safety_stock_units: number;
    recommended_total_units: number;
    service_level: number;
    per_month: { month: string; forecast: number; recommended: number }[];
  };
  methodology: string;
  history: { months: number; total: number; mean: number; sigma: number };
  plan: string;
}

/* ------------------------------------------------------------------ */
/* series construction                                                  */
/* ------------------------------------------------------------------ */

function monthAdd(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function enumerateMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let cur = from;
  while (cur <= to) {
    months.push(cur);
    cur = monthAdd(cur, 1);
  }
  return months;
}

export function buildMonthlySeries(
  orders: Order[],
  metric: ForecastSpec["metric"],
): { month: string; value: number }[] {
  if (orders.length === 0) return [];
  const byMonth = new Map<string, number>();
  for (const o of orders) {
    const v =
      metric === "quantity" ? o.quantity : metric === "revenue" ? o.order_value_usd : 1;
    byMonth.set(o.order_month, (byMonth.get(o.order_month) ?? 0) + v);
  }
  const months = [...byMonth.keys()].sort();
  return enumerateMonths(months[0], months[months.length - 1]).map((m) => ({
    month: m,
    value: Math.round((byMonth.get(m) ?? 0) * 100) / 100,
  }));
}

/* ------------------------------------------------------------------ */
/* methods — each returns one-step fitted values + h-step forecasts     */
/* ------------------------------------------------------------------ */

interface MethodFit {
  fitted: (number | null)[];
  forecast: number[];
  params: Record<string, number>;
}

function fitMovingAverage(y: number[], h: number, window: number): MethodFit {
  const w = Math.min(window, Math.max(2, y.length - 1));
  const fitted: (number | null)[] = y.map((_, t) => {
    if (t < w) return null;
    const slice = y.slice(t - w, t);
    return slice.reduce((a, b) => a + b, 0) / w;
  });
  const extended = [...y];
  const forecast: number[] = [];
  for (let i = 0; i < h; i++) {
    const slice = extended.slice(-w);
    const f = slice.reduce((a, b) => a + b, 0) / w;
    forecast.push(f);
    extended.push(f);
  }
  return { fitted, forecast, params: { window: w } };
}

function fitLinearRegression(y: number[], h: number): MethodFit {
  const n = y.length;
  const xs = y.map((_, i) => i);
  const xMean = (n - 1) / 2;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (y[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const fitted = xs.map((x) => intercept + slope * x);
  const forecast = Array.from({ length: h }, (_, i) =>
    Math.max(0, intercept + slope * (n + i)),
  );
  return {
    fitted,
    forecast,
    params: {
      slope: Math.round(slope * 1000) / 1000,
      intercept: Math.round(intercept * 100) / 100,
    },
  };
}

function fitExponentialSmoothing(y: number[], h: number, alpha: number): MethodFit {
  let level = y[0];
  const fitted: (number | null)[] = [null];
  for (let t = 1; t < y.length; t++) {
    level = alpha * y[t - 1] + (1 - alpha) * level;
    fitted.push(level);
  }
  // final update with the last observation
  level = alpha * y[y.length - 1] + (1 - alpha) * level;
  const forecast = Array.from({ length: h }, () => Math.max(0, level));
  return { fitted, forecast, params: { alpha } };
}

function runMethod(
  method: string,
  y: number[],
  h: number,
  opts: { window: number; alpha: number },
): MethodFit {
  switch (method) {
    case "moving_average":
      return fitMovingAverage(y, h, opts.window);
    case "linear_regression":
      return fitLinearRegression(y, h);
    case "exponential_smoothing":
      return fitExponentialSmoothing(y, h, opts.alpha);
    default:
      throw new Error(`Unknown forecast method: ${method}`);
  }
}

function mae(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.abs(actual[i] - predicted[i]);
  return total / n;
}

/* ------------------------------------------------------------------ */
/* target resolution (handles the sparse-SKU trap)                      */
/* ------------------------------------------------------------------ */

const MIN_HISTORY_MONTHS = 6;

export function resolveTarget(
  orders: Order[],
  spec: ForecastSpec,
): {
  matched: Order[];
  used: { level: string; value?: string };
  fallback_reason?: string;
} {
  const { level, value } = spec.target;

  const filterBy = (lvl: string, val?: string): Order[] => {
    switch (lvl) {
      case "total":
        return orders;
      case "product_category":
        return orders.filter(
          (o) => o.product_category.toLowerCase() === (val ?? "").toLowerCase(),
        );
      case "sku":
        return orders.filter((o) => o.sku.toLowerCase() === (val ?? "").toLowerCase());
      case "region":
        return orders.filter((o) => o.region.toLowerCase() === (val ?? "").toLowerCase());
      case "carrier":
        return orders.filter((o) => o.carrier.toLowerCase() === (val ?? "").toLowerCase());
      case "warehouse":
        return orders.filter((o) => o.warehouse.toLowerCase() === (val ?? "").toLowerCase());
      default:
        return [];
    }
  };

  const direct = filterBy(level, value);

  if (level === "sku") {
    const monthsWithSales = new Set(direct.map((o) => o.order_month)).size;
    if (monthsWithSales < MIN_HISTORY_MONTHS) {
      // SKUs in this dataset appear in 1–3 orders — far too sparse to forecast.
      // Fall back to the SKU's product category (derivable from matched rows
      // or from the SKU prefix, e.g. "CRAYON-0017" → CRAYON).
      const category =
        direct[0]?.product_category ?? (value ?? "").split("-")[0].toUpperCase();
      const catOrders = filterBy("product_category", category);
      if (catOrders.length > 0) {
        return {
          matched: catOrders,
          used: { level: "product_category", value: category },
          fallback_reason: `SKU "${value}" appears in only ${direct.length} order(s) across ${monthsWithSales} month(s) — not enough history for a per-SKU forecast. Forecasting its product category "${category}" instead.`,
        };
      }
    }
  }

  return { matched: direct, used: { level, value } };
}

/* ------------------------------------------------------------------ */
/* main entry                                                           */
/* ------------------------------------------------------------------ */

const METHOD_LABELS: Record<string, string> = {
  moving_average: "Moving average",
  linear_regression: "Linear regression (trend)",
  exponential_smoothing: "Exponential smoothing",
};

let forecastCounter = 0;

export function runForecast(orders: Order[], spec: ForecastSpec): ForecastResult {
  const { matched, used, fallback_reason } = resolveTarget(orders, spec);
  if (matched.length === 0) {
    throw new Error(
      `No orders found for ${spec.target.level}${spec.target.value ? ` "${spec.target.value}"` : ""}. Check the value against the data dictionary.`,
    );
  }

  const series = buildMonthlySeries(matched, spec.metric);
  const y = series.map((p) => p.value);
  const h = spec.horizon_months;
  const opts = { window: spec.window ?? 3, alpha: spec.alpha ?? 0.4 };

  // --- method selection ---
  const candidates = ["moving_average", "linear_regression", "exponential_smoothing"];
  let methodUsed = spec.method;
  const holdout = y.length >= 8 ? 3 : 0;
  const backtestScores: { method: string; mae: number | null }[] = [];

  if (holdout > 0) {
    const train = y.slice(0, -holdout);
    const test = y.slice(-holdout);
    for (const m of candidates) {
      const fit = runMethod(m, train, holdout, opts);
      backtestScores.push({ method: m, mae: Math.round(mae(test, fit.forecast) * 100) / 100 });
    }
  } else {
    for (const m of candidates) backtestScores.push({ method: m, mae: null });
  }

  if (spec.method === "auto") {
    if (holdout > 0) {
      methodUsed = backtestScores.reduce((best, c) =>
        (c.mae ?? Infinity) < (best.mae ?? Infinity) ? c : best,
      ).method as ForecastSpec["method"];
    } else {
      methodUsed = "moving_average";
    }
  }

  const fit = runMethod(methodUsed, y, h, opts);

  // --- uncertainty from one-step-ahead residuals ---
  const residuals: number[] = [];
  fit.fitted.forEach((f, i) => {
    if (f !== null) residuals.push(y[i] - f);
  });
  const sigma =
    residuals.length > 1
      ? Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / (residuals.length - 1))
      : Math.sqrt(y.reduce((a, v) => a + (v - y.reduce((s, x) => s + x, 0) / y.length) ** 2, 0) / Math.max(1, y.length - 1));

  const z80 = 1.282;
  const z95 = 1.645;

  // --- assemble combined series for visualization ---
  const lastMonth = series[series.length - 1].month;
  const points: ForecastPoint[] = series.map((p, i) => ({
    month: p.month,
    actual: p.value,
    fitted: fit.fitted[i] === null ? null : Math.round((fit.fitted[i] as number) * 100) / 100,
    forecast: null,
    lower: null,
    upper: null,
  }));
  for (let i = 0; i < h; i++) {
    const f = fit.forecast[i];
    points.push({
      month: monthAdd(lastMonth, i + 1),
      actual: null,
      fitted: null,
      forecast: Math.round(f * 100) / 100,
      lower: Math.round(Math.max(0, f - z80 * sigma) * 100) / 100,
      upper: Math.round((f + z80 * sigma) * 100) / 100,
    });
  }
  // bridge point so the forecast line connects to the last actual
  const bridge = points[series.length - 1];
  bridge.forecast = bridge.actual;
  bridge.lower = bridge.actual;
  bridge.upper = bridge.actual;

  // --- inventory recommendation ---
  const safetyPerMonth = z95 * sigma;
  const perMonth = fit.forecast.map((f, i) => ({
    month: monthAdd(lastMonth, i + 1),
    forecast: Math.round(f * 100) / 100,
    recommended: Math.ceil(Math.max(0, f + safetyPerMonth)),
  }));
  const totalForecast = fit.forecast.reduce((a, b) => a + b, 0);
  const totalRecommended = perMonth.reduce((a, p) => a + p.recommended, 0);

  const metricLabel =
    spec.metric === "quantity" ? "units" : spec.metric === "revenue" ? "USD" : "orders";

  const methodology = [
    `Aggregated ${matched.length} orders into a monthly ${spec.metric} series (${series.length} months, ${series[0].month} → ${lastMonth}).`,
    holdout > 0
      ? `Backtested all three methods on the last ${holdout} months (train on the rest, score by MAE): ${backtestScores
          .map((c) => `${METHOD_LABELS[c.method]} = ${c.mae}`)
          .join(", ")}. ${spec.method === "auto" ? `Selected ${METHOD_LABELS[methodUsed]} (lowest error).` : `Method ${METHOD_LABELS[methodUsed]} was explicitly requested.`}`
      : `Series too short to backtest; defaulted to ${METHOD_LABELS[methodUsed]}.`,
    `Projected ${h} month(s) ahead. The shaded band is ±1.28σ (~80% interval) where σ=${Math.round(sigma * 100) / 100} is the standard deviation of one-step-ahead residuals — with only ${series.length} monthly observations, treat it as a rough guide.`,
    `Inventory recommendation = monthly forecast + safety stock (1.645σ ≈ 95% service level): stock ${totalRecommended} ${metricLabel} over the horizon vs ${Math.round(totalForecast)} forecast ${metricLabel}.`,
  ].join(" ");

  forecastCounter += 1;
  return {
    result_id: `fc_${Date.now().toString(36)}_${forecastCounter.toString(36)}`,
    target: { requested: spec.target, used, fallback_reason },
    metric: spec.metric,
    method_used: methodUsed,
    method_label: METHOD_LABELS[methodUsed],
    params: fit.params,
    series: points,
    backtest: {
      evaluated: holdout > 0,
      holdout_months: holdout,
      candidates: backtestScores,
      note:
        holdout > 0
          ? "MAE on the final 3 months, trained on the preceding months."
          : "Not enough history for a holdout backtest.",
    },
    inventory: {
      horizon_months: h,
      total_forecast_units: Math.round(totalForecast * 100) / 100,
      safety_stock_units: Math.ceil(safetyPerMonth),
      recommended_total_units: totalRecommended,
      service_level: 0.95,
      per_month: perMonth,
    },
    methodology,
    history: {
      months: series.length,
      total: Math.round(y.reduce((a, b) => a + b, 0) * 100) / 100,
      mean: Math.round((y.reduce((a, b) => a + b, 0) / y.length) * 100) / 100,
      sigma: Math.round(sigma * 100) / 100,
    },
    plan: `Filter orders to ${used.level}${used.value ? ` = ${used.value}` : ""} → monthly ${spec.metric} series → ${METHOD_LABELS[methodUsed]} → ${h}-month forecast + 95% service-level inventory recommendation`,
  };
}
