"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileCode2, Terminal, TriangleAlert } from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { cn } from "@/lib/utils";

interface NbOutput {
  kind: "text" | "image" | "error";
  text?: string;
  png?: string;
}

interface NbCell {
  type: "markdown" | "code";
  source: string;
  execution_count?: number | null;
  outputs?: NbOutput[];
}

function CodeCell({ cell }: { cell: NbCell }) {
  const lines = cell.source.split("\n").length;
  const [open, setOpen] = useState(lines <= 16);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 border-b border-border bg-panel-2/60 px-3.5 py-2"
      >
        <span className="rounded-md bg-navy px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
          In [{cell.execution_count ?? " "}]
        </span>
        <FileCode2 size={12} className="text-ink-3" />
        <span className="text-[11px] text-ink-3">
          python · {lines} line{lines === 1 ? "" : "s"}
        </span>
        <span className="flex-1" />
        <ChevronDown
          size={13}
          className={cn("text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <pre className="max-h-[420px] overflow-auto bg-[#0d1b26] px-4 py-3.5 font-mono text-[11.5px] leading-relaxed text-slate-100">
          {cell.source}
        </pre>
      )}

      {cell.outputs && cell.outputs.length > 0 && (
        <div className="space-y-2 border-t border-border bg-bg-2/40 p-3">
          {cell.outputs.map((out, i) =>
            out.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`data:image/png;base64,${out.png}`}
                alt="notebook output"
                className="mx-auto max-w-full rounded-xl border border-border bg-white p-2"
              />
            ) : (
              <div
                key={i}
                className={cn(
                  "flex gap-2 overflow-auto rounded-xl border px-3 py-2.5",
                  out.kind === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-border bg-panel text-ink-2",
                )}
              >
                {out.kind === "error" ? (
                  <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                ) : (
                  <Terminal size={12} className="mt-0.5 shrink-0 text-ink-3" />
                )}
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                  {out.text}
                </pre>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function NotebookViewer() {
  const [cells, setCells] = useState<NbCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cellRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    fetch("/api/notebook")
      .then((r) => r.json())
      .then((j) => (j.cells ? setCells(j.cells) : setError(j.error)))
      .catch((e) => setError(e.message));
  }, []);

  const headings = useMemo(() => {
    if (!cells) return [];
    const out: { text: string; cellIndex: number }[] = [];
    cells.forEach((c, i) => {
      if (c.type !== "markdown") return;
      const m = c.source.split("\n").find((l) => /^#{1,2} /.test(l));
      if (m) out.push({ text: m.replace(/^#+ /, "").trim(), cellIndex: i });
    });
    return out;
  }, [cells]);

  if (error) {
    return <div className="card p-6 text-[13px] text-rose-700">Notebook unavailable: {error}</div>;
  }
  if (!cells) return <div className="skeleton h-96 w-full" />;

  return (
    <div>
      {/* table of contents */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1.5 overflow-x-auto bg-bg/85 px-1 py-2 backdrop-blur">
        {headings.map((h) => (
          <button
            key={h.cellIndex}
            onClick={() =>
              cellRefs.current
                .get(h.cellIndex)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="tag shrink-0 transition-colors hover:border-brand-2 hover:bg-brand-soft hover:text-brand"
          >
            {h.text.length > 38 ? `${h.text.slice(0, 38)}…` : h.text}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {cells.map((cell, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) cellRefs.current.set(i, el);
            }}
            className="scroll-mt-16"
          >
            {cell.type === "markdown" ? (
              <div className="px-1 [&_.prose-chat]:text-[13.5px]">
                <Markdown>{cell.source}</Markdown>
              </div>
            ) : (
              <CodeCell cell={cell} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
