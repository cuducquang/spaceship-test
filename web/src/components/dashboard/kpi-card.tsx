"use client";

import type { LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TONES = {
  brand: { icon: "text-brand", iconBg: "bg-brand-soft" },
  good: { icon: "text-good", iconBg: "bg-emerald-50" },
  warn: { icon: "text-warn", iconBg: "bg-amber-50" },
  bad: { icon: "text-bad", iconBg: "bg-rose-50" },
  info: { icon: "text-sky", iconBg: "bg-sky-50" },
} as const;

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
  definition,
  loading,
  onAsk,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  definition?: string;
  loading?: boolean;
  onAsk?: () => void;
}) {
  const t = TONES[tone];
  return (
    <div className="card card-hover group relative p-4 text-left">
      <div className="mb-2.5 flex items-center justify-between">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", t.iconBg)}>
          <Icon size={15} className={t.icon} strokeWidth={2.4} />
        </div>
        {definition && <InfoTip content={definition} />}
      </div>
      <button
        onClick={onAsk}
        className="block w-full text-left"
        title={onAsk ? "Ask the AI analyst about this metric" : undefined}
      >
        <div className="stat-label">{label}</div>
        {loading ? (
          <div className="skeleton mt-1.5 h-7 w-20" />
        ) : (
          <div className="font-display mt-0.5 text-[26px] font-bold leading-tight tracking-tight text-ink">
            {value}
          </div>
        )}
        {sub && !loading && <div className="mt-0.5 text-[11.5px] text-ink-3">{sub}</div>}
      </button>
    </div>
  );
}
