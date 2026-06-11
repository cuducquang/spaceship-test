"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock3, Package, Timer } from "lucide-react";
import type { ChartPayloadData } from "@/lib/agent/events";
import type { QueryResult, QuerySpec } from "@/lib/analytics/specs";
import { DynamicChart } from "@/components/charts/dynamic-chart";
import { ChartCard, ChartSkeleton } from "@/components/dashboard/chart-card";
import {
  DEFAULT_FILTERS,
  describeFilters,
  FilterBar,
  PERIOD_LABELS,
  toQueryFilters,
  type DashboardFilters,
} from "@/components/dashboard/filter-bar";
import { HeroKpi, KpiCard } from "@/components/dashboard/kpi-card";
import { useQuery } from "@/lib/client/use-query";
import { formatValue } from "@/lib/utils";

interface Meta {
  regions: string[];
  carriers: string[];
  categories: string[];
  dateRange: { from: string; to: string };
  source: string;
  rowCount: number;
}

function resultToChart(
  result: QueryResult,
  cfg: Omit<ChartPayloadData, "columns" | "rows">,
): ChartPayloadData {
  return {
    ...cfg,
    columns: result.columns.map((c) => ({ key: c.key, label: c.label })),
    rows: result.rows,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((j) =>
        setMeta({
          regions: j.info.distinct.regions,
          carriers: j.info.distinct.carriers,
          categories: j.info.distinct.categories,
          dateRange: j.info.dateRange,
          source: j.info.source,
          rowCount: j.info.rowCount,
        }),
      )
      .catch(() => null);
  }, []);

  const qf = useMemo(() => toQueryFilters(filters), [filters]);
  const timeDim = filters.period === "3m" ? ("date:week" as const) : ("date:month" as const);

  const kpis = useQuery({
    metrics: [
      "order_count",
      "delivered_count",
      "delayed_count",
      "on_time_rate",
      "avg_delivery_days",
      "completed_count",
    ],
    filters: qf,
  });

  const volume = useQuery({
    metrics: ["order_count", "total_quantity"],
    dimensions: [timeDim],
    filters: qf,
  });

  const performance = useQuery({
    metrics: ["delivered_count", "delayed_count", "exception_count"],
    dimensions: [timeDim],
    filters: qf,
  });

  const avgTime = useQuery({
    metrics: ["avg_delivery_days"],
    dimensions: [timeDim],
    filters: qf,
  });

  const carriers = useQuery({
    metrics: ["delay_rate", "completed_count"],
    dimensions: ["carrier"],
    filters: qf,
    sort: { by: "delay_rate", dir: "desc" },
  });

  const regions = useQuery({
    metrics: ["order_count"],
    dimensions: ["region"],
    filters: qf,
  });

  const categories = useQuery({
    metrics: ["total_quantity", "order_count"],
    dimensions: ["product_category"],
    filters: qf,
    sort: { by: "total_quantity", dir: "desc" },
  } satisfies QuerySpec);

  const kpiRow = kpis.data?.rows[0];
  const completed = Number(kpiRow?.completed_count ?? 0);

  /* monthly trend series for the KPI sparklines */
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const trends = useMemo(() => {
    const vol = volume.data?.rows.map((r) => num(r.order_count)) ?? [];
    const perf = performance.data?.rows ?? [];
    const delivered = perf.map((r) => num(r.delivered_count));
    const delayed = perf.map((r) => num(r.delayed_count));
    const onTime = perf.map((r) => {
      const total = num(r.delivered_count) + num(r.delayed_count) + num(r.exception_count);
      return total > 0 ? num(r.delivered_count) / total : 0;
    });
    const days = avgTime.data?.rows.map((r) => num(r.avg_delivery_days)) ?? [];
    return { vol, delivered, delayed, onTime, days };
  }, [volume.data, performance.data, avgTime.data]);

  const trendLabel = timeDim === "date:week" ? "weekly trend" : "12 month trend";

  const ask = (question: string) => router.push(`/chat?q=${encodeURIComponent(question)}`);
  const filterSuffix =
    describeFilters(filters) === PERIOD_LABELS.all ? "" : ` (scope: ${describeFilters(filters)})`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-6 py-6">
        {/* header */}
        <header className="mb-5">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
            Operations dashboard
          </h1>
        </header>

        {/* filters */}
        <div className="mb-5">
          <FilterBar filters={filters} onChange={setFilters} meta={meta} />
        </div>

        {/* KPI bento — hero on-time gauge + four instrument cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-12">
          <div className="col-span-2 md:col-span-4 md:row-span-2">
            <HeroKpi
              label="On time delivery rate"
              loading={kpis.loading}
              value={formatValue(kpiRow?.on_time_rate ?? null, "percent")}
              pct={kpiRow ? Number(kpiRow.on_time_rate) : null}
              trend={trends.onTime}
              definition="delivered ÷ completed (delivered + delayed + exception). In transit and canceled orders are excluded because their outcome is unknown or void."
              onAsk={() =>
                ask(`Why is the on time rate what it is${filterSuffix}? Which regions or carriers drag it down?`)
              }
              breakdown={
                kpiRow
                  ? [
                      {
                        label: "delivered",
                        value: formatValue(kpiRow.delivered_count, "number"),
                        tone: "good",
                      },
                      {
                        label: "delayed",
                        value: formatValue(kpiRow.delayed_count, "number"),
                        tone: "warn",
                      },
                      {
                        label: "exception",
                        value: String(
                          completed -
                            Number(kpiRow.delivered_count) -
                            Number(kpiRow.delayed_count),
                        ),
                        tone: "bad",
                      },
                    ]
                  : undefined
              }
            />
          </div>
          <div className="md:col-span-4">
          <KpiCard
            label="Total orders"
            icon={Package}
            tone="cyan"
            loading={kpis.loading}
            value={formatValue(kpiRow?.order_count ?? null, "number")}
            sub={filters.period === "all" ? "full year 2025" : PERIOD_LABELS[filters.period]}
            definition="Count of all orders matching the filters, regardless of status."
            trend={trends.vol}
            trendLabel={trendLabel}
            onAsk={() => ask(`How many orders did we receive${filterSuffix}? Break it down by month.`)}
          />
          </div>
          <div className="md:col-span-4">
          <KpiCard
            label="Delivered"
            icon={CheckCircle2}
            tone="good"
            loading={kpis.loading}
            value={formatValue(kpiRow?.delivered_count ?? null, "number")}
            sub={
              kpiRow
                ? `${formatValue(Number(kpiRow.delivered_count) / Number(kpiRow.order_count), "percent")} of all orders`
                : undefined
            }
            definition="Orders with status delivered: arrived without a recorded delay."
            trend={trends.delivered}
            trendLabel={trendLabel}
            onAsk={() => ask(`How is our delivered-orders volume trending by month${filterSuffix}?`)}
          />
          </div>
          <div className="md:col-span-4">
          <KpiCard
            label="Delayed"
            icon={Clock3}
            tone="warn"
            loading={kpis.loading}
            value={formatValue(kpiRow?.delayed_count ?? null, "number")}
            sub={
              kpiRow && completed > 0
                ? `${formatValue(Number(kpiRow.delayed_count) / completed, "percent")} of completed`
                : undefined
            }
            definition="Orders with status delayed: they were eventually delivered, but late."
            trend={trends.delayed}
            trendLabel={trendLabel}
            onAsk={() =>
              ask(`Show delayed orders by week${filterSuffix} and tell me which carrier causes most of them.`)
            }
          />
          </div>
          <div className="md:col-span-4">
          <KpiCard
            label="Avg delivery time"
            icon={Timer}
            tone="info"
            loading={kpis.loading}
            value={formatValue(kpiRow?.avg_delivery_days ?? null, "days")}
            sub={`across ${completed || "…"} completed orders`}
            definition="Mean days from order date to delivery date across orders that have a delivery date (delivered, delayed and exception)."
            trend={trends.days}
            trendLabel={trendLabel}
            onAsk={() => ask(`Compare average delivery time by carrier${filterSuffix}. Who is slowest?`)}
          />
          </div>
        </div>

        {/* charts */}
        <div className="grid grid-cols-12 gap-4 pb-10">
          <ChartCard
            className="col-span-12 lg:col-span-8 fade-up"
            title="Order volume over time"
            subtitle={`Orders per ${timeDim === "date:week" ? "ISO week" : "month"}`}
            askQuestion={`Explain the order volume trend${filterSuffix}. What's behind the biggest spike and the biggest dip?`}
            onAsk={ask}
          >
            {volume.data ? (
              <DynamicChart
                height={280}
                chart={resultToChart(volume.data, {
                  type: "area",
                  title: "Order volume",
                  x: timeDim,
                  series: ["order_count"],
                })}
              />
            ) : (
              <ChartSkeleton height={280} />
            )}
          </ChartCard>

          <ChartCard
            className="col-span-12 lg:col-span-4 fade-up"
            title="Orders by region"
            subtitle="Share of order count"
            askQuestion={`Compare regions${filterSuffix}: order volume, on time rate and average delivery time.`}
            onAsk={ask}
          >
            {regions.data ? (
              <DynamicChart
                height={280}
                chart={resultToChart(regions.data, {
                  type: "donut",
                  title: "Orders by region",
                  x: "region",
                  series: ["order_count"],
                })}
              />
            ) : (
              <ChartSkeleton height={280} />
            )}
          </ChartCard>

          <ChartCard
            className="col-span-12 lg:col-span-6 fade-up"
            title="Delivery performance"
            subtitle="Delivered vs delayed vs exception (completed orders)"
            definition="Counts of completed orders by outcome. In-transit and canceled orders are excluded."
            askQuestion={`In which ${timeDim === "date:week" ? "weeks" : "months"} was delivery performance worst${filterSuffix}, and why?`}
            onAsk={ask}
          >
            {performance.data ? (
              <DynamicChart
                height={300}
                chart={resultToChart(performance.data, {
                  type: "stacked_bar",
                  title: "Delivery performance",
                  x: timeDim,
                  series: ["delivered_count", "delayed_count", "exception_count"],
                })}
              />
            ) : (
              <ChartSkeleton height={300} />
            )}
          </ChartCard>

          <ChartCard
            className="col-span-12 lg:col-span-6 fade-up"
            title="Delay rate by carrier"
            subtitle="delayed ÷ completed orders. Small carriers can swing on few orders"
            definition="Delay rate = delayed ÷ completed orders per carrier. GLS ships only a handful of orders, so treat its rate with care."
            askQuestion={`Which carrier has the highest delay rate${filterSuffix}? Account for sample size.`}
            onAsk={ask}
          >
            {carriers.data ? (
              <DynamicChart
                height={300}
                chart={resultToChart(carriers.data, {
                  type: "horizontal_bar",
                  title: "Delay rate by carrier",
                  x: "carrier",
                  series: ["delay_rate"],
                  value_format: "percent",
                })}
              />
            ) : (
              <ChartSkeleton height={300} />
            )}
          </ChartCard>

          <ChartCard
            className="col-span-12 fade-up"
            title="Demand by product category"
            subtitle="Units ordered per category"
            askQuestion={`Which product categories drive demand${filterSuffix}, and what does the demand forecast for the top category look like for the next 4 months?`}
            onAsk={ask}
          >
            {categories.data ? (
              <DynamicChart
                height={240}
                chart={resultToChart(categories.data, {
                  type: "bar",
                  title: "Demand by category",
                  x: "product_category",
                  series: ["total_quantity"],
                })}
              />
            ) : (
              <ChartSkeleton height={240} />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
