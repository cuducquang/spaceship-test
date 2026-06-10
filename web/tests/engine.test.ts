import { beforeAll, describe, expect, it } from "vitest";
import { runQuery } from "@/lib/analytics/engine";
import { runForecast } from "@/lib/analytics/forecast";
import type { QuerySpec } from "@/lib/analytics/specs";
import { getLocalDataset, isoWeek } from "@/lib/data/dataset";
import type { Dataset } from "@/lib/data/types";

/**
 * Ground-truth values in this file were computed INDEPENDENTLY of the engine
 * (PowerShell aggregation over the raw CSV) so the tests verify the engine
 * rather than echo it.
 */

let ds: Dataset;
const opts = () => ({
  datasetMinDate: ds.info.dateRange.from,
  datasetMaxDate: ds.info.dateRange.to,
});

const q = (spec: QuerySpec) => runQuery(ds.orders, spec, opts());

beforeAll(() => {
  ds = getLocalDataset();
});

describe("dataset loading", () => {
  it("loads all 400 orders with the full 2025 date range", () => {
    expect(ds.orders).toHaveLength(400);
    expect(ds.info.dateRange).toEqual({ from: "2025-01-01", to: "2025-12-30" });
  });

  it("parses quoted city fields containing commas", () => {
    const origins = new Set(ds.orders.map((o) => o.origin_city));
    expect(origins.has("London, UK")).toBe(true);
    expect(origins.has("San Francisco, CA")).toBe(true);
    expect(ds.info.distinct.originCities).toHaveLength(9);
  });

  it("has delivery_date exactly for completed orders", () => {
    const missing = ds.orders.filter((o) => o.delivery_date === null);
    expect(missing).toHaveLength(30);
    expect(missing.every((o) => o.status === "in_transit" || o.status === "canceled")).toBe(
      true,
    );
  });

  it("order_value always equals quantity × unit_price", () => {
    for (const o of ds.orders) {
      expect(Math.abs(o.order_value_usd - o.quantity * o.unit_price_usd)).toBeLessThan(0.011);
    }
  });

  it("knows distinct entity counts", () => {
    expect(ds.info.distinct.clients).toHaveLength(30);
    expect(ds.info.distinct.carriers).toHaveLength(9);
    expect(ds.info.distinct.warehouses).toHaveLength(9);
    expect(ds.info.distinct.skuCount).toBe(355);
  });
});

describe("ISO week bucketing", () => {
  it("matches ISO-8601 edge cases", () => {
    expect(isoWeek("2025-01-01")).toBe("2025-W01"); // Wednesday
    expect(isoWeek("2025-12-28")).toBe("2025-W52"); // Sunday
    expect(isoWeek("2025-12-29")).toBe("2026-W01"); // Monday → ISO year 2026
  });
});

describe("core KPIs (whole dataset)", () => {
  it("computes the five dashboard KPIs correctly", () => {
    const res = q({
      metrics: [
        "order_count",
        "delivered_count",
        "delayed_count",
        "on_time_rate",
        "avg_delivery_days",
      ],
    });
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    expect(row.order_count).toBe(400);
    expect(row.delivered_count).toBe(304);
    expect(row.delayed_count).toBe(55);
    // 304 delivered / 370 completed (304 + 55 + 11)
    expect(row.on_time_rate).toBeCloseTo(304 / 370, 4);
    // weighted mean across 370 rows with a delivery_date:
    // delivered avg 3.25 (988d), delayed 6.109 (336d), exception 8.4545 (93d) → 1417/370
    expect(row.avg_delivery_days).toBeCloseTo(1417 / 370, 2);
  });

  it("counts every status", () => {
    const res = q({
      metrics: [
        "exception_count",
        "in_transit_count",
        "canceled_count",
        "completed_count",
        "late_count",
        "promo_order_count",
        "total_revenue",
      ],
    });
    const row = res.rows[0];
    expect(row.exception_count).toBe(11);
    expect(row.in_transit_count).toBe(27);
    expect(row.canceled_count).toBe(3);
    expect(row.completed_count).toBe(370);
    expect(row.late_count).toBe(66);
    expect(row.promo_order_count).toBe(22);
    expect(row.total_revenue).toBeCloseTo(13695.87, 1);
  });
});

describe("grouping and filtering", () => {
  it("computes carrier delay counts (delayed status per carrier)", () => {
    const res = q({ metrics: ["order_count", "delayed_count"], dimensions: ["carrier"] });
    const byCarrier = Object.fromEntries(res.rows.map((r) => [r.carrier, r]));
    expect(byCarrier.USPS.order_count).toBe(49);
    expect(byCarrier.USPS.delayed_count).toBe(11);
    expect(byCarrier.DPD.delayed_count).toBe(0);
    expect(byCarrier.GLS.order_count).toBe(9);
    expect(byCarrier.FedEx.order_count).toBe(89);
    expect(byCarrier.UPS.order_count).toBe(88);
  });

  it("filters by month via explicit dates", () => {
    const jan = q({
      metrics: ["order_count"],
      filters: { date_from: "2025-01-01", date_to: "2025-01-31" },
    });
    expect(jan.rows[0].order_count).toBe(75);
    const sep = q({
      metrics: ["order_count"],
      filters: { date_from: "2025-09-01", date_to: "2025-09-30" },
    });
    expect(sep.rows[0].order_count).toBe(18);
  });

  it("resolves relative windows against the dataset max date", () => {
    const res = q({
      metrics: ["order_count"],
      filters: { relative_window: { unit: "month", n: 3 } },
    });
    // last 3 months of data = 2025-10-01 → 2025-12-30 = 26 + 24 + 24 orders
    expect(res.meta.resolved_date_range).toEqual({ from: "2025-10-01", to: "2025-12-30" });
    expect(res.rows[0].order_count).toBe(74);
  });

  it("region + status filters compose", () => {
    const res = q({
      metrics: ["order_count"],
      filters: { regions: ["UK"], statuses: ["delayed"] },
    });
    const ukDelayed = ds.orders.filter((o) => o.region === "UK" && o.status === "delayed");
    expect(res.rows[0].order_count).toBe(ukDelayed.length);
    expect(res.meta.applied_filters).toHaveLength(2);
  });

  it("fills empty weekly buckets for continuous time series", () => {
    const res = q({
      metrics: ["delayed_count"],
      dimensions: ["date:week"],
      filters: { relative_window: { unit: "month", n: 3 } },
    });
    const weeks = res.rows.map((r) => r["date:week"] as string);
    // continuous: every consecutive pair differs by exactly one ISO week
    expect(weeks.length).toBeGreaterThanOrEqual(13);
    expect([...weeks].sort()).toEqual(weeks); // sorted ascending by default
    const total = res.rows.reduce((a, r) => a + Number(r.delayed_count), 0);
    const expected = ds.orders.filter(
      (o) => o.order_date >= "2025-10-01" && o.status === "delayed",
    ).length;
    expect(total).toBe(expected);
  });

  it("sorts by metric desc and limits", () => {
    const res = q({
      metrics: ["delay_rate"],
      dimensions: ["carrier"],
      sort: { by: "delay_rate", dir: "desc" },
      limit: 3,
    });
    expect(res.rows).toHaveLength(3);
    const rates = res.rows.map((r) => Number(r.delay_rate));
    expect(rates[0]).toBeGreaterThanOrEqual(rates[1]);
    expect(rates[1]).toBeGreaterThanOrEqual(rates[2]);
  });

  it("produces an explainable plan and filter list", () => {
    const res = q({
      metrics: ["order_count"],
      dimensions: ["carrier"],
      filters: { regions: ["EU"], relative_window: { unit: "month", n: 6 } },
    });
    expect(res.meta.plan).toContain("group by Carrier");
    expect(res.meta.applied_filters.map((f) => f.label)).toEqual(["Order date", "Region"]);
  });
});

describe("forecasting", () => {
  it("forecasts category demand with backtest-selected method", () => {
    const res = runForecast(ds.orders, {
      target: { level: "product_category", value: "CRAYON" },
      metric: "quantity",
      horizon_months: 4,
      method: "auto",
    });
    const history = res.series.filter((p) => p.actual !== null);
    const future = res.series.filter((p) => p.actual === null);
    expect(history).toHaveLength(12);
    expect(future).toHaveLength(4);
    // independently computed: CRAYON monthly units sum to 229 in 2025
    expect(res.history.total).toBe(229);
    expect(res.backtest.evaluated).toBe(true);
    expect(res.backtest.candidates).toHaveLength(3);
    expect(future.every((p) => (p.forecast ?? 0) >= 0)).toBe(true);
    expect(future.every((p) => (p.upper ?? 0) >= (p.forecast ?? 0))).toBe(true);
    expect(res.inventory.recommended_total_units).toBeGreaterThanOrEqual(
      Math.floor(res.inventory.total_forecast_units),
    );
    expect(res.series.filter((p) => p.forecast !== null)).toHaveLength(5); // bridge + 4
  });

  it("falls back from a sparse SKU to its product category", () => {
    const sku = ds.orders[0].sku; // any real SKU — all are sparse (≤3 orders)
    const category = ds.orders[0].product_category;
    const res = runForecast(ds.orders, {
      target: { level: "sku", value: sku },
      metric: "quantity",
      horizon_months: 3,
      method: "auto",
    });
    expect(res.target.used.level).toBe("product_category");
    expect(res.target.used.value).toBe(category);
    expect(res.target.fallback_reason).toContain(sku);
  });

  it("respects explicit method choice", () => {
    const res = runForecast(ds.orders, {
      target: { level: "total" },
      metric: "order_count",
      horizon_months: 2,
      method: "linear_regression",
    });
    expect(res.method_used).toBe("linear_regression");
    expect(res.params).toHaveProperty("slope");
  });

  it("throws a helpful error for unknown targets", () => {
    expect(() =>
      runForecast(ds.orders, {
        target: { level: "product_category", value: "DOES_NOT_EXIST" },
        metric: "quantity",
        horizon_months: 4,
        method: "auto",
      }),
    ).toThrow(/No orders found/);
  });
});
