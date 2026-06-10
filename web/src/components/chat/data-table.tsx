"use client";

import { formatValue, type ValueFormat } from "@/lib/utils";

export interface TableColumn {
  key: string;
  label: string;
  format?: ValueFormat;
}

export function DataTable({
  columns,
  rows,
  maxHeight = 320,
}: {
  columns: TableColumn[];
  rows: Record<string, string | number | boolean | null>[];
  maxHeight?: number;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight }}>
      <table className="w-full border-collapse text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="border-b border-border bg-panel-2 px-3 py-2 text-left font-semibold text-ink-2"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="transition-colors odd:bg-panel even:bg-panel-2/40 hover:bg-brand-soft/60">
              {columns.map((c) => {
                const value = row[c.key];
                const numeric = typeof value === "number";
                return (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap border-b border-border/60 px-3 py-1.5 text-ink ${numeric ? "text-right font-mono text-[12px]" : ""}`}
                  >
                    {formatValue(value, c.format ?? "text")}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-ink-3">
                No rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
