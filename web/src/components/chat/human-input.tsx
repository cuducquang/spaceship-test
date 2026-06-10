"use client";

import { useState } from "react";
import { Braces } from "lucide-react";

/**
 * Renders a tool's structured input as readable label/value rows instead of
 * raw JSON. Raw JSON stays available behind a small toggle for debugging.
 */

function humanizeKey(key: string): string {
  const special: Record<string, string> = {
    "date:day": "By day",
    "date:week": "By week",
    "date:month": "By month",
    "date:quarter": "By quarter",
  };
  if (special[key]) return special[key];
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUsd\b/g, "USD")
    .replace(/\bSku(s)?\b/g, "SKU$1")
    .replace(/\bId(s)?\b/g, "ID$1");
}

function scalarText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function isScalar(v: unknown): boolean {
  return v === null || ["string", "number", "boolean"].includes(typeof v);
}

function ValueView({ value }: { value: unknown }) {
  if (isScalar(value)) {
    return <span className="font-medium text-ink">{scalarText(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.every(isScalar)) {
      return (
        <span className="flex flex-wrap gap-1">
          {value.map((v, i) => (
            <span key={i} className="tag !py-0.5 font-medium">
              {scalarText(v)}
            </span>
          ))}
        </span>
      );
    }
    return (
      <span className="space-y-1">
        {value.map((v, i) => (
          <ValueView key={i} value={v} />
        ))}
      </span>
    );
  }
  // nested object → indented sub-rows
  return (
    <span className="block space-y-1 border-l-2 border-border pl-2.5 pt-0.5">
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <span key={k} className="flex items-baseline gap-2 text-[11.5px]">
          <span className="shrink-0 text-ink-3">{humanizeKey(k)}</span>
          <ValueView value={v} />
        </span>
      ))}
    </span>
  );
}

export function HumanInput({ input }: { input: unknown }) {
  const [raw, setRaw] = useState(false);

  const entries =
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.entries(input as Record<string, unknown>)
      : null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="stat-label">Structured input</span>
        <button
          onClick={() => setRaw(!raw)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink-2"
        >
          <Braces size={10} />
          {raw ? "readable" : "raw JSON"}
        </button>
      </div>

      {raw || !entries ? (
        <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-panel px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-ink-2">
          {JSON.stringify(input ?? {}, null, 2)}
        </pre>
      ) : entries.length === 0 ? (
        <p className="text-[11.5px] text-ink-3">No parameters</p>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-panel px-3 py-2.5">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2.5 text-[12px]">
              <span className="w-[92px] shrink-0 text-[11px] font-semibold text-ink-3">
                {humanizeKey(k)}
              </span>
              <ValueView value={v} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
