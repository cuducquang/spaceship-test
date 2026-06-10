import { z } from "zod";

/**
 * Structured query contracts.
 *
 * The AI layer never writes SQL or computes numbers — it emits one of these
 * specs, the spec is validated here (zod), and the deterministic engine in
 * `engine.ts` / `forecast.ts` executes it. This is the "structured query
 * generation" architecture the brief asks for.
 */

/* ------------------------------------------------------------------ */
/* QuerySpec                                                            */
/* ------------------------------------------------------------------ */

export const METRIC_KEYS = [
  "order_count",
  "delivered_count",
  "delayed_count",
  "exception_count",
  "in_transit_count",
  "canceled_count",
  "completed_count",
  "late_count",
  "on_time_rate",
  "delay_rate",
  "late_rate",
  "cancellation_rate",
  "avg_delivery_days",
  "median_delivery_days",
  "p90_delivery_days",
  "total_quantity",
  "total_revenue",
  "avg_order_value",
  "promo_order_count",
  "distinct_clients",
  "distinct_skus",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const DIMENSION_KEYS = [
  "carrier",
  "region",
  "status",
  "product_category",
  "warehouse",
  "origin_city",
  "destination_city",
  "client_id",
  "sku",
  "is_promo",
  "date:day",
  "date:week",
  "date:month",
  "date:quarter",
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date yyyy-mm-dd");

export const RelativeWindowSchema = z.strictObject({
  unit: z.enum(["day", "week", "month"]),
  n: z.number().int().min(1).max(36),
});

export const QueryFiltersSchema = z.strictObject({
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  /**
   * Resolved against the dataset's most recent order date (not today),
   * because the mock data covers Jan–Dec 2025.
   */
  relative_window: RelativeWindowSchema.optional(),
  carriers: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  statuses: z
    .array(z.enum(["delivered", "delayed", "in_transit", "exception", "canceled"]))
    .optional(),
  product_categories: z.array(z.string()).optional(),
  warehouses: z.array(z.string()).optional(),
  origin_cities: z.array(z.string()).optional(),
  destination_cities: z.array(z.string()).optional(),
  client_ids: z.array(z.string()).optional(),
  skus: z.array(z.string()).optional(),
  is_promo: z.boolean().optional(),
});
export type QueryFilters = z.infer<typeof QueryFiltersSchema>;

export const QuerySpecSchema = z.strictObject({
  metrics: z.array(z.enum(METRIC_KEYS)).min(1).max(8),
  dimensions: z.array(z.enum(DIMENSION_KEYS)).max(2).optional(),
  filters: QueryFiltersSchema.optional(),
  sort: z
    .strictObject({
      by: z.string(),
      dir: z.enum(["asc", "desc"]),
    })
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type QuerySpec = z.infer<typeof QuerySpecSchema>;

/* ------------------------------------------------------------------ */
/* ChartSpec                                                            */
/* ------------------------------------------------------------------ */

export const CHART_TYPES = [
  "line",
  "area",
  "bar",
  "stacked_bar",
  "horizontal_bar",
  "donut",
  "combo",
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const ChartSpecSchema = z.strictObject({
  type: z.enum(CHART_TYPES),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  /** Result to visualize — id returned by query_orders or forecast_demand. */
  result_id: z.string(),
  /** Column key for the x axis / donut labels (must exist in the result). */
  x: z.string(),
  /** Column keys plotted as series (must exist in the result). */
  series: z.array(z.string()).min(1).max(5),
  /** For combo charts: series rendered as a line on a secondary axis. */
  line_series: z.array(z.string()).max(2).optional(),
  value_format: z.enum(["number", "percent", "currency", "days"]).optional(),
});
export type ChartSpec = z.infer<typeof ChartSpecSchema>;

/* ------------------------------------------------------------------ */
/* ForecastSpec                                                         */
/* ------------------------------------------------------------------ */

export const FORECAST_METHODS = [
  "auto",
  "moving_average",
  "linear_regression",
  "exponential_smoothing",
] as const;
export type ForecastMethod = (typeof FORECAST_METHODS)[number];

export const ForecastSpecSchema = z.strictObject({
  target: z.strictObject({
    level: z.enum(["total", "product_category", "sku", "region", "carrier", "warehouse"]),
    /** Required unless level === "total". */
    value: z.string().optional(),
  }),
  metric: z.enum(["quantity", "order_count", "revenue"]).default("quantity"),
  horizon_months: z.number().int().min(1).max(12).default(4),
  method: z.enum(FORECAST_METHODS).default("auto"),
  /** Window for moving average (months). */
  window: z.number().int().min(2).max(6).optional(),
  /** Smoothing factor for exponential smoothing, 0–1. */
  alpha: z.number().min(0.05).max(0.95).optional(),
});
export type ForecastSpec = z.infer<typeof ForecastSpecSchema>;

/* ------------------------------------------------------------------ */
/* Shared result envelope                                               */
/* ------------------------------------------------------------------ */

export interface ResultColumn {
  key: string;
  label: string;
  kind: "dimension" | "metric";
  format: "text" | "number" | "percent" | "currency" | "days";
}

export interface QueryResultMeta {
  result_id: string;
  plan: string;
  applied_filters: { label: string; value: string }[];
  resolved_date_range: { from: string; to: string } | null;
  metrics: { key: string; label: string; definition: string }[];
  dimensions: string[];
  row_count: number;
  matched_orders: number;
  definitions_note?: string;
}

export interface QueryResult {
  columns: ResultColumn[];
  rows: Record<string, string | number | boolean | null>[];
  meta: QueryResultMeta;
}
