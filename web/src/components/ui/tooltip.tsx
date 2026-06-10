"use client";

import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Portal-based tooltip — never clipped by card overflow or covered by
 * neighboring elements (replaces the old absolute-positioned hover spans).
 */
export function InfoTip({
  content,
  side = "bottom",
  className,
  children,
}: {
  content: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children ?? (
            <button
              type="button"
              aria-label="Definition"
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink-2",
                className,
              )}
            >
              <Info size={13} />
            </button>
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="z-[60] max-w-[290px] rounded-xl border border-border bg-panel px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink-2 shadow-[var(--shadow-lift)]"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-panel stroke-[var(--border)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
