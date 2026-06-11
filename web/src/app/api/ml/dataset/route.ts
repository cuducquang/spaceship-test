import { getDataset } from "@/lib/data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Training view of the bundled dataset: completed orders with order-time
 * features and the late/on_time label (mirrors the research notebook setup).
 */
export async function GET() {
  const dataset = await getDataset();
  const rows = dataset.orders
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

  return Response.json({
    rows,
    preset: {
      target: "outcome",
      positive: "late",
      features: [
        { name: "carrier", kind: "categorical" },
        { name: "region", kind: "categorical" },
        { name: "warehouse", kind: "categorical" },
        { name: "product_category", kind: "categorical" },
        { name: "order_month", kind: "categorical" },
        { name: "quantity", kind: "numeric" },
        { name: "unit_price_usd", kind: "numeric" },
        { name: "is_promo", kind: "categorical" },
      ],
      note: "Completed orders only (delivered + delayed + exception); features are knowable at order time, nothing derived from the delivery date.",
    },
  });
}
