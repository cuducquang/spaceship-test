"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  Crown,
  FlaskConical,
  Globe2,
  Layers,
  Loader2,
  Package,
  Play,
  ShieldCheck,
  Tag,
  TrendingUp,
  Truck,
} from "lucide-react";
import type { ForecastResult } from "@/lib/analytics/forecast";
import { ForecastSeriesChart, monthShort } from "@/components/chat/blocks";
import { CountUp } from "@/components/ui/count-up";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LEVELS = [
  { value: "product_category", label: "Category", icon: Package },
  { value: "total", label: "Network", icon: Layers },
  { value: "region", label: "Region", icon: Globe2 },
  { value: "carrier", label: "Carrier", icon: Truck },
  { value: "warehouse", label: "Warehouse", icon: Building2 },
  { value: "sku", label: "Single SKU", icon: Tag },
] as const;

const METHODS = [
  { value: "auto", label: "Auto", hint: "backtests all three, picks the lowest MAE" },
  { value: "moving_average", label: "Moving average", hint: "mean of the trailing window" },
  { value: "linear_regression", label: "Linear regression", hint: "least squares trend" },
  { value: "exponential_smoothing", label: "Exp. smoothing", hint: "recency weighted level" },
] as const;

const METRICS = [
  { value: "quantity", label: "Units" },
  { value: "order_count", label: "Orders" },
  { value: "revenue", label: "Revenue" },
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

  useEffect(() => {
    if (!distinct || result || loading) return;
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distinct]);

  const metricLabel =
    result?.metric === "quantity" ? "units" : result?.metric === "revenue" ? "USD" : "orders";

  const podium = useMemo(() => {
    if (!result?.backtest.evaluated) return null;
    const candidates = result.backtest.candidates.filter((c) => c.mae !== null);
    const best = Math.min(...candidates.map((c) => c.mae as number));
    return candidates
      .map((c) => ({
        method: c.method,
        mae: c.mae as number,
        score: best / (c.mae as number),
        winner: c.method === result.method_used,
      }))
      .sort((a, b) => a.mae - b.mae);
  }, [result]);

  const maxRecommended = useMemo(
    () => Math.max(1, ...(result?.inventory.per_month.map((m) => m.recommended) ?? [1])),
    [result],
  );

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="aurora" />
      </div>
      <div className="mx-auto max-w-[1180px] px-6 py-6 pb-16">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-cyan shadow-md shadow-violet/25">
                <TrendingUp size={18} className="text-white" />
              </span>
              Forecast studio
            </h1>
          </div>
          <div className="flex gap-1.5">
            <span className="tag">
              <ShieldCheck size={11} className="text-good" /> deterministic engine
            </span>
            <span className="tag">
              <FlaskConical size={11} className="text-violet" /> 3 method backtest
            </span>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[300px_1fr]">
          {/* ------------------------------ control rail ------------------------------ */}
          <aside className="card sticky top-5 space-y-4 p-4">
            <div>
              <span className="stat-label">Forecast for</span>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => {
                      setLevel(l.value);
                      if (l.value === "product_category") setValue("CRAYON");
                      else if (l.value === "region") setValue(distinct?.regions[0] ?? "");
                      else if (l.value === "carrier") setValue(distinct?.carriers[0] ?? "");
                      else if (l.value === "warehouse") setValue(distinct?.warehouses[0] ?? "");
                      else if (l.value === "sku") setValue("CRAYON-0017");
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] font-semibold transition-all",
                      level === l.value
                        ? "border-brand-2 bg-brand-soft text-brand shadow-sm"
                        : "border-border bg-panel text-ink-2 hover:border-brand-2/50",
                    )}
                  >
                    <l.icon size={13} />
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {level !== "total" && (
              <div>
                <span className="stat-label">Target</span>
                <div className="mt-2">
                  {valueOptions ? (
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
                      className="h-10 w-full rounded-xl border border-border bg-panel px-3.5 text-[13px] font-medium text-ink shadow-sm outline-none transition-all hover:border-brand-2 focus:border-brand-2 focus:ring-4 focus:ring-brand-2/15"
                    />
                  )}
                </div>
              </div>
            )}

            <div>
              <span className="stat-label">Metric</span>
              <div className="mt-2 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-panel-2/60 p-0.5">
                {METRICS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMetric(m.value)}
                    className={cn(
                      "rounded-[10px] py-1.5 text-[12px] font-semibold transition-all",
                      metric === m.value
                        ? "bg-panel text-brand shadow-sm"
                        : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="stat-label">ML method</span>
              <div className="mt-2 space-y-1.5">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMethod(m.value)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left transition-all",
                      method === m.value
                        ? "border-violet/50 bg-violet/5 shadow-sm"
                        : "border-border bg-panel hover:border-violet/30",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border-2",
                          method === m.value ? "border-violet bg-violet" : "border-border-2",
                        )}
                      />
                      <span className="text-[12.5px] font-semibold text-ink">{m.label}</span>
                      {m.value === "auto" && (
                        <span className="rounded-full bg-violet/10 px-1.5 py-px text-[9px] font-bold uppercase text-violet">
                          rec
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block pl-4.5 text-[10.5px] leading-snug text-ink-3">
                      {m.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <span className="stat-label">Horizon</span>
                <span className="font-mono text-[12px] font-bold text-brand">
                  {horizon} month{horizon === 1 ? "" : "s"}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={12}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="mt-2 w-full accent-[#6d5dd3]"
              />
            </div>

            <button onClick={run} disabled={loading} className="btn-primary w-full justify-center">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {loading ? "Computing…" : "Run forecast"}
            </button>
            <p className="text-[10.5px] leading-relaxed text-ink-3">
              SKU series are sparse (≤3 orders each), so SKU requests fall back to the SKU&apos;s
              category, and the result says so.
            </p>
          </aside>

          {/* ------------------------------ results stage ------------------------------ */}
          <section className="min-w-0 space-y-4">
            {error && (
              <div className="card border-bad/30 bg-bad/10 p-4 text-[13px] text-bad">
                {error}
              </div>
            )}

            {loading && !result && (
              <div className="card flex h-[420px] flex-col items-center justify-center gap-3">
                <Loader2 size={22} className="animate-spin text-violet" />
                <p className="shimmer-text text-[13px] font-semibold">
                  aggregating series · backtesting 3 methods · projecting
                </p>
              </div>
            )}

            {result && (
              <>
                {/* stat strip */}
                <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <div className="card p-3.5">
                    <div className="stat-label">Forecast · {result.inventory.horizon_months}mo</div>
                    <div className="font-display mt-1 text-[24px] font-bold text-ink">
                      <CountUp value={result.inventory.total_forecast_units} />
                      <span className="ml-1 text-[12px] font-medium text-ink-3">{metricLabel}</span>
                    </div>
                  </div>
                  <div className="card accent-top p-3.5" style={{ "--accent-grad": "linear-gradient(90deg,#0e7c66,#0891b2)" } as React.CSSProperties}>
                    <div className="stat-label">Recommended stock</div>
                    <div className="font-display mt-1 text-[24px] font-bold text-brand">
                      <CountUp value={result.inventory.recommended_total_units} />
                      <span className="ml-1 text-[12px] font-medium text-ink-3">{metricLabel}</span>
                    </div>
                  </div>
                  <div className="card p-3.5">
                    <div className="stat-label">Safety stock</div>
                    <div className="font-display mt-1 text-[24px] font-bold text-ink">
                      +<CountUp value={result.inventory.safety_stock_units} />
                      <span className="ml-1 text-[12px] font-medium text-ink-3">/mo</span>
                    </div>
                    <div className="text-[10px] text-ink-3">95% service level</div>
                  </div>
                  <div className="card p-3.5">
                    <div className="stat-label">Method</div>
                    <div className="font-display mt-1 truncate text-[15px] font-bold text-violet">
                      {result.method_label}
                    </div>
                    <div className="text-[10px] text-ink-3">
                      {result.backtest.evaluated
                        ? `backtested on ${result.backtest.holdout_months}mo holdout`
                        : "default for short series"}
                    </div>
                  </div>
                </div>

                {/* main chart */}
                <div
                  className="card accent-top fade-up overflow-hidden"
                  style={{ "--accent-grad": "linear-gradient(90deg,#6d5dd3,#0891b2)" } as React.CSSProperties}
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                    <h3 className="font-display text-[15px] font-bold text-ink">
                      {result.target.used.value ?? "Whole network"}
                    </h3>
                    <span className="tag">{metricLabel}/month</span>
                    <span className="tag border-violet/30 bg-violet/10 text-violet">
                      {result.method_label}
                    </span>
                    <span className="flex-1" />
                    <span className="font-mono text-[10.5px] text-ink-3">
                      σ = {result.history.sigma} · {result.history.months}mo history
                    </span>
                  </div>
                  {result.target.fallback_reason && (
                    <p className="mx-4 mt-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[11.5px] leading-relaxed text-warn">
                      {result.target.fallback_reason}
                    </p>
                  )}
                  <div className="px-2 py-3">
                    <ForecastSeriesChart result={result} height={330} />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* backtest podium */}
                  {podium && (
                    <div className="card fade-up p-4">
                      <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                        <FlaskConical size={13} className="text-violet" />
                        Backtest: MAE on the last {result.backtest.holdout_months} months
                      </div>
                      <div className="space-y-2.5">
                        {podium.map((c) => (
                          <div key={c.method} className="flex items-center gap-2.5">
                            <span className="flex w-40 shrink-0 items-center gap-1.5 text-[12px] font-semibold text-ink-2">
                              {c.winner && <Crown size={12} className="text-amber-500" />}
                              {c.method.replace(/_/g, " ")}
                            </span>
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                              <div
                                className={cn(
                                  "bar-grow h-full rounded-full",
                                  c.winner
                                    ? "bg-gradient-to-r from-violet to-cyan"
                                    : "bg-border-2",
                                )}
                                style={{ width: `${Math.max(8, c.score * 100)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right font-mono text-[11.5px] font-bold text-ink">
                              {c.mae}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-3">
                        {result.backtest.note} Longer bar = lower error.
                      </p>
                    </div>
                  )}

                  {/* inventory plan */}
                  <div className="card fade-up p-4">
                    <div className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                      <Boxes size={13} className="text-brand" />
                      Inventory plan: forecast + safety stock
                    </div>
                    <div className="space-y-2">
                      {result.inventory.per_month.map((m) => (
                        <div key={m.month} className="flex items-center gap-2.5">
                          <span className="w-14 shrink-0 font-mono text-[11px] font-semibold text-ink-2">
                            {monthShort(m.month)}
                          </span>
                          <div className="h-5 flex-1 overflow-hidden rounded-md bg-panel-2">
                            <div
                              className="bar-grow flex h-full items-center justify-end rounded-md bg-gradient-to-r from-brand to-brand-2 pr-1.5"
                              style={{ width: `${(m.recommended / maxRecommended) * 100}%` }}
                            >
                              <span className="font-mono text-[10px] font-bold text-white">
                                {m.recommended}
                              </span>
                            </div>
                          </div>
                          <span className="w-16 shrink-0 text-right font-mono text-[10.5px] text-ink-3">
                            fc {Math.round(m.forecast)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-[10.5px] leading-relaxed text-ink-3">
                      Recommended = monthly forecast + 1.645σ safety stock (95% service level).
                    </p>
                  </div>
                </div>

                {/* methodology */}
                <div className="card fade-up border-l-4 border-l-violet p-4">
                  <div className="mb-1.5 text-[12.5px] font-bold text-ink">Methodology</div>
                  <p className="text-[12.5px] leading-relaxed text-ink-2">{result.methodology}</p>
                  <p className="mt-2 font-mono text-[10.5px] text-ink-3">{result.plan}</p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
