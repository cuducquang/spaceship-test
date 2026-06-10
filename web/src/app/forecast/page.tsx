"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, TrendingUp } from "lucide-react";
import type { ForecastResult } from "@/lib/analytics/forecast";
import { ForecastBlock } from "@/components/chat/blocks";
import { Select } from "@/components/ui/select";

const LEVELS = [
  { value: "product_category", label: "Product category" },
  { value: "total", label: "All orders" },
  { value: "region", label: "Region" },
  { value: "carrier", label: "Carrier" },
  { value: "warehouse", label: "Warehouse" },
  { value: "sku", label: "Single SKU" },
] as const;

const METHODS = [
  { value: "auto", label: "Auto (backtest picks best)" },
  { value: "moving_average", label: "Moving average" },
  { value: "linear_regression", label: "Linear regression" },
  { value: "exponential_smoothing", label: "Exponential smoothing" },
] as const;

const METRICS = [
  { value: "quantity", label: "Units (demand)" },
  { value: "order_count", label: "Orders" },
  { value: "revenue", label: "Revenue (USD)" },
] as const;

interface Distinct {
  categories: string[];
  regions: string[];
  carriers: string[];
  warehouses: string[];
}

export default function ForecastPage() {
  const [distinct, setDistinct] = useState<Distinct | null>(null);
  const [level, setLevel] = useState<string>("product_category");
  const [value, setValue] = useState<string>("CRAYON");
  const [metric, setMetric] = useState<string>("quantity");
  const [method, setMethod] = useState<string>("auto");
  const [horizon, setHorizon] = useState(4);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((j) =>
        setDistinct({
          categories: j.info.distinct.categories,
          regions: j.info.distinct.regions,
          carriers: j.info.distinct.carriers,
          warehouses: j.info.distinct.warehouses,
        }),
      )
      .catch(() => null);
  }, []);

  const valueOptions =
    level === "product_category"
      ? distinct?.categories
      : level === "region"
        ? distinct?.regions
        : level === "carrier"
          ? distinct?.carriers
          : level === "warehouse"
            ? distinct?.warehouses
            : null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spec: {
            target: { level, ...(level === "total" ? {} : { value }) },
            metric,
            method,
            horizon_months: horizon,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Forecast failed");
      setResult(json.result);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // run a default forecast on first load
  useEffect(() => {
    if (distinct && !result && !loading) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 py-6 pb-16">
        <header className="mb-5">
          <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
            <TrendingUp className="text-brand" size={24} />
            Demand forecasting
          </h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-3">
            The same deterministic engine the AI analyst uses: monthly history → backtested
            method selection → forecast with an uncertainty band and a 95%-service-level
            inventory recommendation.
          </p>
        </header>

        {/* controls */}
        <div className="card mb-5 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <label className="flex flex-col gap-1.5">
              <span className="stat-label">Forecast for</span>
              <Select
                value={level}
                onValueChange={(next) => {
                  setLevel(next);
                  if (next === "product_category") setValue("CRAYON");
                  else if (next === "region") setValue(distinct?.regions[0] ?? "");
                  else if (next === "carrier") setValue(distinct?.carriers[0] ?? "");
                  else if (next === "warehouse") setValue(distinct?.warehouses[0] ?? "");
                  else if (next === "sku") setValue("CRAYON-0017");
                }}
                options={LEVELS.map((l) => ({ value: l.value, label: l.label }))}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="stat-label">Target</span>
              {level === "total" ? (
                <div className="flex h-10 items-center rounded-xl border border-border bg-panel-2 px-3.5 text-[13px] text-ink-3">
                  whole network
                </div>
              ) : valueOptions ? (
                <Select
                  value={value}
                  onValueChange={setValue}
                  options={valueOptions.map((v) => ({ value: v, label: v }))}
                />
              ) : (
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. CRAYON-0017"
                  className="h-10 rounded-xl border border-border bg-panel px-3.5 text-[13px] font-medium text-ink shadow-sm outline-none transition-all hover:border-brand-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-2/15"
                />
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="stat-label">Metric</span>
              <Select
                value={metric}
                onValueChange={setMetric}
                options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="stat-label">ML method</span>
              <Select
                value={method}
                onValueChange={setMethod}
                options={METHODS.map((m) => ({ value: m.value, label: m.label }))}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="stat-label">Horizon: {horizon} months</span>
              <input
                type="range"
                min={1}
                max={12}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="h-10 accent-[#0e7c66]"
              />
            </label>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-ink-3">
              SKU-level series are sparse (≤3 orders each) — SKU requests automatically fall back
              to the SKU&apos;s product category, and the result says so.
            </p>
            <button onClick={run} disabled={loading} className="btn-primary shrink-0">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              Run forecast
            </button>
          </div>
        </div>

        {error && (
          <div className="card border-rose-200 bg-rose-50/70 p-4 text-[13px] text-rose-700">
            {error}
          </div>
        )}

        {loading && !result && <div className="skeleton h-[420px] w-full" />}

        {result && <ForecastBlock result={result} />}
      </div>
    </div>
  );
}
