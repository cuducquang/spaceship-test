"use client";

import { Archive, Loader2 } from "lucide-react";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const COMPACT_AT = 24_000;

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * Context-usage meter: how full the model's working context was on the last
 * turn, relative to the auto-compaction threshold.
 */
export function ContextBar({
  lastContextTokens,
  totalIn,
  totalOut,
  canCompact,
  compacting,
  onCompact,
}: {
  lastContextTokens: number;
  totalIn: number;
  totalOut: number;
  canCompact: boolean;
  compacting: boolean;
  onCompact: () => void;
}) {
  const pct = Math.min(100, Math.round((lastContextTokens / COMPACT_AT) * 100));
  const tone =
    pct >= 90 ? "bg-gradient-to-r from-amber-400 to-rose-500"
    : pct >= 60 ? "bg-gradient-to-r from-brand-2 to-amber-400"
    : "bg-gradient-to-r from-brand to-brand-2";

  return (
    <div className="flex items-center gap-2.5">
      <InfoTip
        side="bottom"
        content={
          <div className="space-y-1">
            <p>
              <strong>Context used last turn:</strong> {fmtK(lastContextTokens)} tokens (system
              prompt + tools + history + results).
            </p>
            <p>
              At <strong>{fmtK(COMPACT_AT)}</strong> the conversation compacts automatically: earlier
              turns are summarized by a small model so the session can continue with full
              context awareness.
            </p>
            <p className="text-ink-3">
              Session total · in {fmtK(totalIn)} · out {fmtK(totalOut)}
            </p>
          </div>
        }
      >
        <button className="group flex w-[168px] flex-col gap-1 text-left" aria-label="Context usage">
          <span className="flex items-baseline justify-between text-[10px] font-semibold text-ink-3">
            <span className="uppercase tracking-wider">Context</span>
            <span className="font-mono">
              {fmtK(lastContextTokens)} / {fmtK(COMPACT_AT)}
            </span>
          </span>
          <span className="h-2 w-full overflow-hidden rounded-full border border-border/70 bg-panel-2">
            <span
              className={cn(
                "block h-full rounded-full transition-all duration-700",
                tone,
                pct >= 80 && "bar-stripes",
              )}
              style={{ width: `${Math.max(pct, 3)}%` }}
            />
          </span>
        </button>
      </InfoTip>

      {canCompact && (
        <button
          onClick={onCompact}
          disabled={compacting}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-all",
            pct >= 90
              ? "border-bad/40 bg-bad/10 text-bad hover:bg-bad/20"
              : "border-border bg-panel text-ink-2 hover:border-violet hover:text-violet",
          )}
          title="Summarize earlier turns to free context"
        >
          {compacting ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
          {compacting ? "Compacting…" : "Compact"}
        </button>
      )}
    </div>
  );
}
