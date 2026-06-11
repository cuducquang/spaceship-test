"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Image as ImageIcon,
  LayoutGrid,
  LineChart,
  Maximize2,
  PanelRightClose,
  TrendingUp,
  X,
} from "lucide-react";
import { DynamicChart } from "@/components/charts/dynamic-chart";
import { cn, timeAgo } from "@/lib/utils";
import { ForecastBlock } from "./blocks";
import type { CanvasItem, CanvasKind } from "./canvas-context";

const KIND_META: Record<
  CanvasKind,
  { label: string; icon: typeof LineChart; color: string; grad: string }
> = {
  chart: {
    label: "Chart",
    icon: LineChart,
    color: "text-brand",
    grad: "linear-gradient(90deg, #0e7c66, #0891b2)",
  },
  forecast: {
    label: "Forecast",
    icon: TrendingUp,
    color: "text-violet",
    grad: "linear-gradient(90deg, #6d5dd3, #0891b2)",
  },
  image: {
    label: "Image",
    icon: ImageIcon,
    color: "text-cyan",
    grad: "linear-gradient(90deg, #0891b2, #6d5dd3)",
  },
};

function CanvasBody({ item, large }: { item: CanvasItem; large?: boolean }) {
  if (item.payload.kind === "chart") {
    return <DynamicChart chart={item.payload.chart} height={large ? 420 : 210} />;
  }
  if (item.payload.kind === "forecast") {
    return <ForecastBlock result={item.payload.result} />;
  }
  if (item.payload.kind === "image") {
    return item.payload.data_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.payload.data_url}
        alt={item.payload.prompt}
        className="w-full rounded-lg border border-border"
      />
    ) : (
      <div className="flex h-36 flex-col items-center justify-center gap-2 rounded-lg bg-panel-2 text-ink-3">
        <ImageIcon size={20} />
        <span className="text-[11px]">image not persisted in history</span>
      </div>
    );
  }
  return null;
}

export function CanvasPanel({
  items,
  focusedKey,
  onClose,
}: {
  items: CanvasItem[];
  focusedKey: string | null;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<CanvasKind | "all">("all");
  const [zoomed, setZoomed] = useState<CanvasItem | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const i of items) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [items]);

  useEffect(() => {
    if (!focusedKey) return;
    const el = refs.current.get(focusedKey);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedKey]);

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-border bg-bg-2/50 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:w-[min(400px,94vw)] max-lg:bg-bg-2 max-lg:shadow-[-24px_0_60px_rgba(0,0,0,0.55)]">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border bg-panel/75 px-3.5 py-2.5 backdrop-blur">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan shadow-sm">
          <LayoutGrid size={12} className="text-white" />
        </span>
        <span className="font-display text-[13.5px] font-bold text-ink">Canvas</span>
        <span className="tag !py-0">{items.length}</span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          title="Collapse canvas"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-1 border-b border-border bg-panel/40 px-3 py-2">
        {(["all", "chart", "forecast", "image"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors",
              filter === k ? "bg-brand-2 text-white" : "text-ink-3 hover:bg-panel-2 hover:text-ink-2",
            )}
          >
            {k} {counts[k] ? `· ${counts[k]}` : ""}
          </button>
        ))}
      </div>

      {/* items */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 pt-16 text-center text-ink-3">
            <div className="glass flex h-12 w-12 items-center justify-center rounded-2xl">
              <LayoutGrid size={18} className="text-brand" />
            </div>
            <p className="max-w-[220px] text-[12px] leading-relaxed">
              Charts, forecasts and images the agent creates will appear here live.
            </p>
          </div>
        )}

        {[...filtered].reverse().map((item) => {
          const meta = KIND_META[item.kind];
          const Icon = meta.icon;
          return (
            <div
              key={item.key}
              ref={(el) => {
                if (el) refs.current.set(item.key, el);
              }}
              className={cn(
                "card block-enter accent-top card-hover overflow-hidden",
                focusedKey === item.key && "ring-2 ring-brand-2 shadow-[var(--shadow-glow)]",
              )}
              style={{ "--accent-grad": meta.grad } as React.CSSProperties}
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Icon size={13} className={meta.color} />
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                  {item.title}
                </span>
                <span className="shrink-0 text-[10px] text-ink-3">{timeAgo(new Date(item.ts).toISOString())}</span>
                <button
                  onClick={() => setZoomed(item)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
                  title="Expand"
                >
                  <Maximize2 size={12} />
                </button>
              </div>
              <div className={cn("p-2.5", item.payload.kind === "forecast" && "p-0 [&>.card]:m-0 [&>.card]:border-0 [&>.card]:shadow-none")}>
                <CanvasBody item={item} />
              </div>
            </div>
          );
        })}
      </div>

      {/* zoom dialog */}
      <Dialog.Root open={zoomed !== null} onOpenChange={(o) => !o && setZoomed(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(960px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-panel p-5 shadow-2xl">
            {zoomed && (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <Dialog.Title className="font-display text-[16px] font-bold text-ink">
                    {zoomed.title}
                  </Dialog.Title>
                  <Dialog.Close className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink">
                    <X size={16} />
                  </Dialog.Close>
                </div>
                <CanvasBody item={zoomed} large />
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}
