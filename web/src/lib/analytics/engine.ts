import { BUSINESS_DEFINITIONS } from "@/lib/data/definitions";
import { isoWeek, monthOf, quarterOf, toUtcDate } from "@/lib/data/dataset";
import type { Order } from "@/lib/data/types";
import type {
  DimensionKey,
  MetricKey,
  QueryFilters,
  QueryResult,
  QuerySpec,
  ResultColumn,
} from "./specs";

/* ------------------------------------------------------------------ */
/* metric metadata                                                      */
/* ------------------------------------------------------------------ */

interface MetricDef {
  label: string;
  format: ResultColumn["format"];
  definition: string;
  compute: (orders: Order[]) => number | null;
}

const count = (orders: Order[], pred: (o: Order) => boolean) =>
  orders.reduce((acc, o) => acc + (pred(o) ? 1 : 0), 0);

const sum = (orders: Order[], pick: (o: Order) => number) =>
  orders.reduce((acc, o) => acc + pick(o), 0);

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function deliveryDays(orders: Order[]): number[] {
  return orders
    .filter((o) => o.delivery_days !== null)
    .map((o) => o.delivery_days as number)
    .sort((a, b) => a - b);
}

export const METRICS: Record<MetricKey, MetricDef> = {
  order_count: {
    label: "Total orders",
    format: "number",
    definition: "Count of all orders matching the filters, regardless of status.",
    compute: (o) => o.length,
  },
  delivered_count: {
    label: "Delivered orders",
    format: "number",
    definition: "Orders with status 'delivered' (arrived on time).",
    compute: (o) => count(o, (x) => x.status === "delivered"),
  },
  delayed_count: {
    label: "Delayed orders",
    format: "number",
    definition: "Orders with status 'delayed' (eventually delivered, but late).",
    compute: (o) => count(o, (x) => x.status === "delayed"),
  },
  exception_count: {
    label: "Exception orders",
    format: "number",
    definition: "Orders with status 'exception' (completed with an incident).",
    compute: (o) => count(o, (x) => x.status === "exception"),
  },
  in_transit_count: {
    label: "In-transit orders",
    format: "number",
    definition: "Orders with status 'in_transit' (no delivery outcome yet).",
    compute: (o) => count(o, (x) => x.status === "in_transit"),
  },
  canceled_count: {
    label: "Canceled orders",
    format: "number",
    definition: "Orders with status 'canceled'.",
    compute: (o) => count(o, (x) => x.status === "canceled"),
  },
  completed_count: {
    label: "Completed orders",
    format: "number",
    definition: BUSINESS_DEFINITIONS.completed,
    compute: (o) => count(o, (x) => x.is_completed),
  },
  late_count: {
    label: "Late orders",
    format: "number",
    definition: BUSINESS_DEFINITIONS.late,
    compute: (o) => count(o, (x) => x.is_late),
  },
  on_time_rate: {
    label: "On-time delivery rate",
    format: "percent",
    definition: BUSINESS_DEFINITIONS.on_time_rate,
    compute: (o) =>
      ratio(count(o, (x) => x.is_on_time), count(o, (x) => x.is_completed)),
  },
  delay_rate: {
    label: "Delay rate",
    format: "percent",
    definition: BUSINESS_DEFINITIONS.delay_rate,
    compute: (o) =>
      ratio(count(o, (x) => x.status === "delayed"), count(o, (x) => x.is_completed)),
  },
  late_rate: {
    label: "Late rate",
    format: "percent",
    definition: BUSINESS_DEFINITIONS.late_rate,
    compute: (o) => ratio(count(o, (x) => x.is_late), count(o, (x) => x.is_completed)),
  },
  cancellation_rate: {
    label: "Cancellation rate",
    format: "percent",
    definition: BUSINESS_DEFINITIONS.cancellation_rate,
    compute: (o) => ratio(count(o, (x) => x.status === "canceled"), o.length),
  },
  avg_delivery_days: {
    label: "Avg delivery time (days)",
    format: "days",
    definition: BUSINESS_DEFINITIONS.avg_delivery_days,
    compute: (o) => {
      const d = deliveryDays(o);
      return d.length === 0 ? null : d.reduce((a, b) => a + b, 0) / d.length;
    },
  },
  median_delivery_days: {
    label: "Median delivery time (days)",
    format: "days",
    definition: BUSINESS_DEFINITIONS.median_delivery_days,
    compute: (o) => quantile(deliveryDays(o), 0.5),
  },
  p90_delivery_days: {
    label: "P90 delivery time (days)",
    format: "days",
    definition: BUSINESS_DEFINITIONS.p90_delivery_days,
    compute: (o) => quantile(deliveryDays(o), 0.9),
  },
  total_quantity: {
    label: "Units ordered",
    format: "number",
    definition: BUSINESS_DEFINITIONS.total_quantity,
    compute: (o) => sum(o, (x) => x.quantity),
  },
  total_revenue: {
    label: "Order value (USD)",
    format: "currency",
    definition: BUSINESS_DEFINITIONS.total_revenue,
    compute: (o) => sum(o, (x) => x.order_value_usd),
  },
  avg_order_value: {
    label: "Avg order value (USD)",
    format: "currency",
    definition: "Mean order_value_usd across matching orders.",
    compute: (o) => (o.length === 0 ? null : sum(o, (x) => x.order_value_usd) / o.length),
  },
  promo_order_count: {
    label: "Promo orders",
    format: "number",
    definition: "Orders flagged is_promo = true.",
    compute: (o) => count(o, (x) => x.is_promo),
  },
  distinct_clients: {
    label: "Distinct clients",
    format: "number",
    definition: "Number of unique client_id values among matching orders.",
    compute: (o) => new Set(o.map((x) => x.client_id)).size,
  },
  distinct_skus: {
    label: "Distinct SKUs",
    format: "number",
    definition: "Number of unique sku values among matching orders.",
    compute: (o) => new Set(o.map((x) => x.sku)).size,
  },
};

/* ------------------------------------------------------------------ */
/* dimensions                                                           */
/* ------------------------------------------------------------------ */

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  carrier: "Carrier",
  region: "Region",
  status: "Status",
  product_category: "Product category",
  warehouse: "Warehouse",
  origin_city: "Origin city",
  destination_city: "Destination city",
  client_id: "Client",
  sku: "SKU",
  is_promo: "Promo",
  "date:day": "Day",
  "date:week": "Week",
  "date:month": "Month",
  "date:quarter": "Quarter",
};

function dimensionValue(o: Order, dim: DimensionKey): string {
  switch (dim) {
    case "date:day":
      return o.order_date;
    case "date:week":
      return o.order_week;
    case "date:month":
      return o.order_month;
    case "date:quarter":
      return o.order_quarter;
    case "is_promo":
      return o.is_promo ? "promo" : "standard";
    default:
      return String(o[dim]);
  }
}

/** Enumerate every date bucket between from..to so time series have no gaps. */
function enumerateDateBuckets(dim: DimensionKey, from: string, to: string): string[] {
  const buckets: string[] = [];
  const seen = new Set<string>();
  const cursor = toUtcDate(from);
  const end = toUtcDate(to).getTime();
  while (cursor.getTime() <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const bucket =
      dim === "date:day"
        ? iso
        : dim === "date:week"
          ? isoWeek(iso)
          : dim === "date:month"
            ? monthOf(iso)
            : quarterOf(iso);
    if (!seen.has(bucket)) {
      seen.add(bucket);
      buckets.push(bucket);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

/* ------------------------------------------------------------------ */
/* filters                                                              */
/* ------------------------------------------------------------------ */

function shiftMonths(iso: string, delta: number): string {
  const d = toUtcDate(iso);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, delta: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function resolveDateRange(
  filters: QueryFilters | undefined,
  datasetMaxDate: string,
  datasetMinDate: string,
): { from: string; to: string } | null {
  if (!filters) return null;
  if (filters.relative_window) {
    const { unit, n } = filters.relative_window;
    const to = datasetMaxDate;
    const from =
      unit === "month"
        ? shiftDays(shiftMonths(to, -n), 1)
        : unit === "week"
          ? shiftDays(to, -(7 * n) + 1)
          : shiftDays(to, -n + 1);
    return { from: from < datasetMinDate ? datasetMinDate : from, to };
  }
  if (filters.date_from || filters.date_to) {
    return {
      from: filters.date_from ?? datasetMinDate,
      to: filters.date_to ?? datasetMaxDate,
    };
  }
  return null;
}

interface AppliedFilter {
  label: string;
  value: string;
}

export function applyFilters(
  orders: Order[],
  filters: QueryFilters | undefined,
  resolvedRange: { from: string; to: string } | null,
): { matched: Order[]; applied: AppliedFilter[] } {
  const applied: AppliedFilter[] = [];
  let matched = orders;

  if (resolvedRange) {
    matched = matched.filter(
      (o) => o.order_date >= resolvedRange.from && o.order_date <= resolvedRange.to,
    );
    applied.push({
      label: "Order date",
      value: `${resolvedRange.from} → ${resolvedRange.to}`,
    });
  }

  const inList =
    (pick: (o: Order) => string, list: string[] | undefined, label: string) => {
      if (!list || list.length === 0) return;
      const set = new Set(list.map((v) => v.toLowerCase()));
      matched = matched.filter((o) => set.has(pick(o).toLowerCase()));
      applied.push({ label, value: list.join(", ") });
    };

  inList((o) => o.carrier, filters?.carriers, "Carrier");
  inList((o) => o.region, filters?.regions, "Region");
  inList((o) => o.status, filters?.statuses, "Status");
  inList((o) => o.product_category, filters?.product_categories, "Category");
  inList((o) => o.warehouse, filters?.warehouses, "Warehouse");
  inList((o) => o.origin_city, filters?.origin_cities, "Origin");
  inList((o) => o.destination_city, filters?.destination_cities, "Destination");
  inList((o) => o.client_id, filters?.client_ids, "Client");
  inList((o) => o.sku, filters?.skus, "SKU");

  if (filters?.is_promo !== undefined) {
    matched = matched.filter((o) => o.is_promo === filters.is_promo);
    applied.push({ label: "Promo", value: filters.is_promo ? "promo only" : "standard only" });
  }

  return { matched, applied };
}

/* ------------------------------------------------------------------ */
/* core query execution                                                 */
/* ------------------------------------------------------------------ */

function roundForFormat(value: number | null, format: ResultColumn["format"]): number | null {
  if (value === null) return null;
  switch (format) {
    case "percent":
      return Math.round(value * 10_000) / 10_000; // keep 2dp after ×100
    case "currency":
      return Math.round(value * 100) / 100;
    case "days":
      return Math.round(value * 100) / 100;
    default:
      return Math.round(value * 100) / 100;
  }
}

let resultCounter = 0;
function newResultId(): string {
  resultCounter += 1;
  return `res_${Date.now().toString(36)}_${resultCounter.toString(36)}`;
}

export interface RunQueryOptions {
  datasetMinDate: string;
  datasetMaxDate: string;
}

export function runQuery(
  orders: Order[],
  spec: QuerySpec,
  opts: RunQueryOptions,
): QueryResult {
  const dimensions = spec.dimensions ?? [];
  const resolvedRange = resolveDateRange(spec.filters, opts.datasetMaxDate, opts.datasetMinDate);
  const { matched, applied } = applyFilters(orders, spec.filters, resolvedRange);

  // --- group ---
  const groups = new Map<string, { dims: Record<string, string>; orders: Order[] }>();
  if (dimensions.length === 0) {
    groups.set("__all__", { dims: {}, orders: matched });
  } else {
    for (const o of matched) {
      const dimVals = dimensions.map((d) => dimensionValue(o, d));
      const key = dimVals.join("␞");
      let g = groups.get(key);
      if (!g) {
        g = {
          dims: Object.fromEntries(dimensions.map((d, i) => [d, dimVals[i]])),
          orders: [],
        };
        groups.set(key, g);
      }
      g.orders.push(o);
    }
    // fill empty date buckets so time series are continuous
    if (dimensions.length === 1 && dimensions[0].startsWith("date:")) {
      const range = resolvedRange ?? { from: opts.datasetMinDate, to: opts.datasetMaxDate };
      for (const bucket of enumerateDateBuckets(dimensions[0], range.from, range.to)) {
        if (![...groups.values()].some((g) => g.dims[dimensions[0]] === bucket)) {
          groups.set(`fill␞${bucket}`, { dims: { [dimensions[0]]: bucket }, orders: [] });
        }
      }
    }
  }

  // --- compute ---
  const rows = [...groups.values()].map((g) => {
    const row: Record<string, string | number | boolean | null> = {};
    for (const d of dimensions) row[d] = g.dims[d];
    for (const m of spec.metrics) {
      row[m] = roundForFormat(METRICS[m].compute(g.orders), METRICS[m].format);
    }
    return row;
  });

  // --- sort ---
  const dateDim = dimensions.find((d) => d.startsWith("date:"));
  const sortBy = spec.sort?.by ?? dateDim ?? (dimensions.length > 0 ? spec.metrics[0] : undefined);
  const sortDir = spec.sort?.dir ?? (sortBy === dateDim ? "asc" : "desc");
  if (sortBy) {
    rows.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const limited = spec.limit ? rows.slice(0, spec.limit) : rows;

  // --- columns ---
  const columns: ResultColumn[] = [
    ...dimensions.map(
      (d): ResultColumn => ({
        key: d,
        label: DIMENSION_LABELS[d],
        kind: "dimension",
        format: "text",
      }),
    ),
    ...spec.metrics.map(
      (m): ResultColumn => ({
        key: m,
        label: METRICS[m].label,
        kind: "metric",
        format: METRICS[m].format,
      }),
    ),
  ];

  // --- meta / plan ---
  const planParts = [
    `Filter ${orders.length} orders${applied.length > 0 ? ` (${applied.map((f) => `${f.label}: ${f.value}`).join("; ")})` : " (no filters)"} → ${matched.length} matched`,
    dimensions.length > 0
      ? `group by ${dimensions.map((d) => DIMENSION_LABELS[d]).join(" × ")}`
      : "aggregate all matched orders",
    `compute ${spec.metrics.map((m) => METRICS[m].label).join(", ")}`,
  ];
  if (sortBy) planParts.push(`sort by ${sortBy} ${sortDir}`);
  if (spec.limit) planParts.push(`limit ${spec.limit}`);

  return {
    columns,
    rows: limited,
    meta: {
      result_id: newResultId(),
      plan: planParts.join(" → "),
      applied_filters: applied,
      resolved_date_range: resolvedRange,
      metrics: spec.metrics.map((m) => ({
        key: m,
        label: METRICS[m].label,
        definition: METRICS[m].definition,
      })),
      dimensions: dimensions.map((d) => DIMENSION_LABELS[d]),
      row_count: limited.length,
      matched_orders: matched.length,
      definitions_note:
        spec.metrics.some((m) =>
          ["on_time_rate", "delay_rate", "late_rate", "avg_delivery_days"].includes(m),
        )
          ? "Rates use completed orders (delivered + delayed + exception) as the denominator; in_transit and canceled orders are excluded."
          : undefined,
    },
  };
}
