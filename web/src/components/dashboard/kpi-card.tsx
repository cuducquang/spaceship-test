"use client";

import type { LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/ui/tooltip";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

const TONES = {
  brand: { icon: "text-brand", iconBg: "bg-brand-soft", glow: "99, 102, 241", spark: "#6366f1" },
  good: { icon: "text-good", iconBg: "bg-good/10", glow: "5, 150, 105", spark: "#059669" },
  warn: { icon: "text-warn", iconBg: "bg-warn/10", glow: "217, 119, 6", spark: "#d97706" },
  bad: { icon: "text-bad", iconBg: "bg-bad/10", glow: "225, 29, 72", spark: "#e11d48" },
  info: { icon: "text-sky", iconBg: "bg-sky/10", glow: "2, 132, 199", spark: "#0284c7" },
  cyan: { icon: "text-cyan", iconBg: "bg-cyan/10", glow: "8, 145, 178", spark: "#0891b2" },
} as const;

export type KpiTone = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
  definition,
  loading,
  onAsk,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  definition?: string;
  loading?: boolean;
  onAsk?: () => void;
  /** Monthly series for the inline sparkline. */
  trend?: number[];
  trendLabel?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      className="card card-glow card-hover group relative flex h-full flex-col p-4 text-left"
      style={{ "--glow": t.glow } as React.CSSProperties}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.iconBg)}>
          <Icon size={15} className={t.icon} strokeWidth={2.4} />
        </div>
        {definition && <InfoTip content={definition} />}
      </div>
      <button
        onClick={onAsk}
        className="block w-full flex-1 text-left"
        title={onAsk ? "Ask the AI analyst about this metric" : undefined}
      >
        <div className="stat-label">{label}</div>
        {loading ? (
          <div className="skeleton mt-1.5 h-7 w-20" />
        ) : (
          <div className="num font-mono mt-0.5 text-[25px] font-bold leading-tight tracking-tight text-ink">
            {value}
          </div>
        )}
        {sub && !loading && <div className="mt-0.5 text-[11.5px] text-ink-3">{sub}</div>}
      </button>
      {trend && trend.length > 1 && !loading && (
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-ink-3/80">
            {trendLabel ?? "12 month trend"}
          </span>
          <Sparkline data={trend} stroke={t.spark} width={104} height={30} />
        </div>
      )}
    </div>
  );
}

/**
 * Hero KPI — the metric the whole operation is judged on, with a radial
 * gauge, the trend, and the completed-orders breakdown.
 */
export function HeroKpi({
  label,
  value,
  pct,
  definition,
  loading,
  onAsk,
  trend,
  breakdown,
}: {
  label: string;
  value: string;
  /** 0..1 for the gauge */
  pct: number | null;
  definition?: string;
  loading?: boolean;
  onAsk?: () => void;
  trend?: number[];
  breakdown?: { label: string; value: string; tone: KpiTone }[];
}) {
  const ok = (pct ?? 0) >= 0.8;
  const t = ok ? TONES.good : TONES.warn;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="card card-glow card-hover group relative flex h-full flex-col p-5 text-left"
      style={{ "--glow": t.glow } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <div className="stat-label">{label}</div>
        {definition && <InfoTip content={definition} />}
      </div>

      <button onClick={onAsk} className="mt-3 flex flex-1 flex-col items-center justify-center" title="Ask the AI analyst about this metric">
        <div className="relative h-[132px] w-[132px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(18,46,84,0.1)" strokeWidth="9" />
            {!loading && pct !== null && (
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={t.spark}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - Math.min(1, Math.max(0, pct)))}
                style={{
                  filter: `drop-shadow(0 0 6px rgba(${t.glow}, 0.55))`,
                  transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {loading ? (
              <div className="skeleton h-8 w-20" />
            ) : (
              <span className="num font-mono text-[28px] font-bold leading-none text-ink">{value}</span>
            )}
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              of completed
            </span>
          </div>
        </div>

        {trend && trend.length > 1 && !loading && (
          <div className="mt-2.5 flex flex-col items-center">
            <Sparkline data={trend} stroke={t.spark} width={170} height={34} />
            <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ink-3/80">
              monthly on time rate
            </span>
          </div>
        )}
      </button>

      {breakdown && !loading && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-border pt-3">
          {breakdown.map((b) => (
            <div key={b.label} className="rounded-lg bg-panel-2/60 px-2 py-1.5 text-center">
              <div className={cn("num font-mono text-[14px] font-bold", TONES[b.tone].icon)}>
                {b.value}
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-ink-3">
                {b.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
