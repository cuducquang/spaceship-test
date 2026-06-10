/** Canonical order statuses present in the dataset. */
export const ORDER_STATUSES = [
  "delivered",
  "delayed",
  "in_transit",
  "exception",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Raw row shape as stored in the CSV / Supabase `orders` table. */
export interface RawOrder {
  client_id: string;
  order_id: string;
  order_date: string; // yyyy-mm-dd
  delivery_date: string | null; // yyyy-mm-dd, null for in_transit / canceled
  carrier: string;
  origin_city: string;
  destination_city: string;
  status: OrderStatus;
  sku: string;
  product_category: string;
  quantity: number;
  unit_price_usd: number;
  order_value_usd: number;
  is_promo: boolean;
  promo_discount_pct: number;
  region: string;
  warehouse: string;
}

/** Order enriched with derived analytical fields, computed once at load time. */
export interface Order extends RawOrder {
  /** Days between order_date and delivery_date; null when not yet delivered. */
  delivery_days: number | null;
  /** Order placed bucketed by month: "2025-03". */
  order_month: string;
  /** ISO-8601 week bucket: "2025-W12". */
  order_week: string;
  /** Quarter bucket: "2025-Q1". */
  order_quarter: string;
  /** True when the order reached a terminal shipping outcome (delivered | delayed | exception). */
  is_completed: boolean;
  /** True when delivered without delay (status === "delivered"). */
  is_on_time: boolean;
  /** True when completed late (delayed | exception). */
  is_late: boolean;
}

export interface DatasetInfo {
  /** Where the rows were loaded from. */
  source: "supabase" | "local-csv";
  rowCount: number;
  /** Min/max order_date across the dataset. */
  dateRange: { from: string; to: string };
  loadedAt: string;
  distinct: {
    carriers: string[];
    regions: string[];
    categories: string[];
    warehouses: string[];
    originCities: string[];
    destinationCities: string[];
    clients: string[];
    skuCount: number;
  };
}

export interface Dataset {
  orders: Order[];
  info: DatasetInfo;
}
