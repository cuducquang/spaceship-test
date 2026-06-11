"use client";

import { useState } from "react";
import { ChevronDown, FileSearch, ListFilter, Route, Table2 } from "lucide-react";
import type { QueryResult } from "@/lib/analytics/specs";
import { cn } from "@/lib/utils";
import { DataTable } from "./data-table";

/**
 * Explainability for every answer: applied filters, metrics + definitions,
 * the query plan, and the underlying data (aggregated + raw sample).
 */
export function ExplainPanel({
  result,
  sampleOrders,
}: {
  result: QueryResult;
  sampleOrders: Record<string, string | number | boolean | null>[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"result" | "orders">("result");
  const meta = result.meta;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-panel-2/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11.5px] font-semibold text-ink-2 transition-colors hover:bg-panel-2"
      >
        <span className="flex items-center gap-1.5">
          <FileSearch size={12} className="text-brand" />
          How this was computed · {meta.matched_orders} orders matched
        </span>
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-[12px]">
          {/* plan */}
          <div>
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink-2">
              <Route size={12} className="text-cyan" /> Query plan
            </div>
            <code className="block rounded-lg border border-border bg-panel px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
              {meta.plan}
            </code>
          </div>

          {/* filters */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-2">
              <ListFilter size={12} className="text-violet" /> Filters applied
            </div>
            {meta.applied_filters.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {meta.applied_filters.map((f) => (
                  <span key={f.label} className="tag">
                    <span className="text-ink-3">{f.label}:</span> {f.value}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-ink-3">none — full dataset</span>
            )}
          </div>

          {/* metric definitions */}
          <div>
            <div className="mb-1 font-semibold text-ink-2">Metrics & definitions</div>
            <ul className="space-y-1 text-ink-2">
              {meta.metrics.map((m) => (
                <li key={m.key}>
                  <span className="font-semibold text-ink">{m.label}</span>
                  <span className="text-ink-3"> — {m.definition}</span>
                </li>
              ))}
            </ul>
            {meta.definitions_note && (
              <p className="mt-1.5 rounded-lg border border-warn/25 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">
                {meta.definitions_note}
              </p>
            )}
          </div>

          {/* underlying data */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-ink-2">
                <Table2 size={12} className="text-brand" /> Underlying data
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setTab("result")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    tab === "result" ? "bg-brand text-white" : "bg-panel text-ink-2 hover:bg-panel-2",
                  )}
                >
                  Result ({result.rows.length})
                </button>
                <button
                  onClick={() => setTab("orders")}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    tab === "orders" ? "bg-brand text-white" : "bg-panel text-ink-2 hover:bg-panel-2",
                  )}
                >
                  Order sample ({sampleOrders.length})
                </button>
              </div>
            </div>
            {tab === "result" ? (
              <DataTable
                columns={result.columns.map((c) => ({ key: c.key, label: c.label, format: c.format }))}
                rows={result.rows}
                maxHeight={260}
              />
            ) : (
              <DataTable
                columns={
                  sampleOrders.length > 0
                    ? Object.keys(sampleOrders[0]).map((k) => ({
                        key: k,
                        label: k.replace(/_/g, " "),
                        format: k === "order_value_usd" ? "currency" : "text",
                      }))
                    : []
                }
                rows={sampleOrders}
                maxHeight={260}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
