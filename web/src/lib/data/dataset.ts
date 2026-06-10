import fs from "node:fs";
import path from "node:path";
import { parseCsvObjects } from "./csv";
import type { Dataset, DatasetInfo, Order, OrderStatus, RawOrder } from "./types";
import { ORDER_STATUSES } from "./types";

/* ------------------------------------------------------------------ */
/* date helpers                                                         */
/* ------------------------------------------------------------------ */

export function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO-8601 week label, e.g. "2025-W07". */
export function isoWeek(iso: string): string {
  const d = toUtcDate(iso);
  // Thursday of the current week decides the ISO year
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const week =
    1 + Math.round((d.getTime() - week1Monday.getTime()) / (7 * 86_400_000) - 3 / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function quarterOf(iso: string): string {
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

/* ------------------------------------------------------------------ */
/* row mapping                                                          */
/* ------------------------------------------------------------------ */

function deriveOrder(raw: RawOrder): Order {
  const isCompleted =
    raw.status === "delivered" || raw.status === "delayed" || raw.status === "exception";
  return {
    ...raw,
    delivery_days: raw.delivery_date ? daysBetween(raw.order_date, raw.delivery_date) : null,
    order_month: monthOf(raw.order_date),
    order_week: isoWeek(raw.order_date),
    order_quarter: quarterOf(raw.order_date),
    is_completed: isCompleted,
    is_on_time: raw.status === "delivered",
    is_late: raw.status === "delayed" || raw.status === "exception",
  };
}

function fromCsvRecord(rec: Record<string, string>): RawOrder {
  const status = rec.status as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`Unknown order status "${rec.status}" for ${rec.order_id}`);
  }
  return {
    client_id: rec.client_id,
    order_id: rec.order_id,
    order_date: rec.order_date,
    delivery_date: rec.delivery_date ? rec.delivery_date : null,
    carrier: rec.carrier,
    origin_city: rec.origin_city,
    destination_city: rec.destination_city,
    status,
    sku: rec.sku,
    product_category: rec.product_category,
    quantity: Number(rec.quantity),
    unit_price_usd: Number(rec.unit_price_usd),
    order_value_usd: Number(rec.order_value_usd),
    is_promo: rec.is_promo === "1" || rec.is_promo === "true",
    promo_discount_pct: Number(rec.promo_discount_pct || 0),
    region: rec.region,
    warehouse: rec.warehouse,
  };
}

/* ------------------------------------------------------------------ */
/* loading                                                              */
/* ------------------------------------------------------------------ */

function buildInfo(orders: Order[], source: DatasetInfo["source"]): DatasetInfo {
  const distinctSorted = (vals: string[]) => [...new Set(vals)].sort();
  const dates = orders.map((o) => o.order_date).sort();
  return {
    source,
    rowCount: orders.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    loadedAt: new Date().toISOString(),
    distinct: {
      carriers: distinctSorted(orders.map((o) => o.carrier)),
      regions: distinctSorted(orders.map((o) => o.region)),
      categories: distinctSorted(orders.map((o) => o.product_category)),
      warehouses: distinctSorted(orders.map((o) => o.warehouse)),
      originCities: distinctSorted(orders.map((o) => o.origin_city)),
      destinationCities: distinctSorted(orders.map((o) => o.destination_city)),
      clients: distinctSorted(orders.map((o) => o.client_id)),
      skuCount: new Set(orders.map((o) => o.sku)).size,
    },
  };
}

export function loadOrdersFromCsvText(text: string): Order[] {
  return parseCsvObjects(text).map(fromCsvRecord).map(deriveOrder);
}

function loadLocalDataset(): Dataset {
  const csvPath = path.join(process.cwd(), "data", "mock_logistics_data.csv");
  const text = fs.readFileSync(csvPath, "utf8");
  const orders = loadOrdersFromCsvText(text);
  return { orders, info: buildInfo(orders, "local-csv") };
}

async function loadSupabaseDataset(): Promise<Dataset | null> {
  const { getServerSupabaseConfig } = await import("@/lib/server/supabase-key");
  const config = getServerSupabaseConfig();
  if (!config) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(config.url, config.key);
    const pageSize = 1000;
    const rows: RawOrder[] = [];
    for (let fromIdx = 0; ; fromIdx += pageSize) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "client_id,order_id,order_date,delivery_date,carrier,origin_city,destination_city,status,sku,product_category,quantity,unit_price_usd,order_value_usd,is_promo,promo_discount_pct,region,warehouse",
        )
        .order("order_id", { ascending: true })
        .range(fromIdx, fromIdx + pageSize - 1);
      if (error) {
        console.warn(`[dataset] Supabase unavailable (${error.message}); using bundled CSV.`);
        return null;
      }
      if (!data || data.length === 0) break;
      rows.push(...(data as RawOrder[]));
      if (data.length < pageSize) break;
    }
    if (rows.length === 0) {
      console.warn("[dataset] Supabase 'orders' table is empty; using bundled CSV.");
      return null;
    }
    const orders = rows
      .map((r) => ({ ...r, delivery_date: r.delivery_date || null }))
      .map(deriveOrder);
    return { orders, info: buildInfo(orders, "supabase") };
  } catch (err) {
    console.warn(`[dataset] Supabase load failed (${(err as Error).message}); using bundled CSV.`);
    return null;
  }
}

/* Module-level cache — the dataset is read-only, load it once per runtime. */
let cached: Dataset | null = null;
let pending: Promise<Dataset> | null = null;

export async function getDataset(): Promise<Dataset> {
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      const fromSupabase = await loadSupabaseDataset();
      cached = fromSupabase ?? loadLocalDataset();
      return cached;
    })();
  }
  return pending;
}

/** Synchronous accessor for tests / scripts that work directly off the CSV. */
export function getLocalDataset(): Dataset {
  return loadLocalDataset();
}
