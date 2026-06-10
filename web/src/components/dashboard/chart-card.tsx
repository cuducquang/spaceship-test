"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { InfoTip } from "@/components/ui/tooltip";

export function ChartCard({
  title,
  subtitle,
  definition,
  askQuestion,
  onAsk,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  definition?: string;
  askQuestion?: string;
  onAsk?: (q: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card group relative flex flex-col p-5 ${className ?? ""}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[12px] text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {definition && <InfoTip content={definition} />}
          {askQuestion && onAsk && (
            <button
              onClick={() => onAsk(askQuestion)}
              className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-cyan px-3 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-md shadow-brand/30 transition-all hover:scale-105 group-hover:opacity-100"
            >
              <Sparkles size={11} />
              Ask AI
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height }} />;
}
