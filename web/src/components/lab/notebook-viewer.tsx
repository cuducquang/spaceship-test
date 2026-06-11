"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenText,
  ChevronDown,
  FileCode2,
  Gavel,
  Terminal,
  TriangleAlert,
} from "lucide-react";
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

/* ------------------------------------------------------------------ */
/* output text: colorize audit + verdict lines                          */
/* ------------------------------------------------------------------ */

function OutputLine({ line }: { line: string }) {
  if (/^PASS\b/.test(line)) {
    return (
      <span>
        <span className="font-bold text-good">PASS</span>
        <span className="text-ink-2">{line.slice(4)}</span>
      </span>
    );
  }
  if (/^FAIL\b/.test(line)) {
    return (
      <span>
        <span className="font-bold text-bad">FAIL</span>
        <span className="text-ink-2">{line.slice(4)}</span>
      </span>
    );
  }
  if (/^criterion /.test(line)) {
    const pass = line.includes("PASS");
    return (
      <span className={cn("font-semibold", pass ? "text-good" : "text-bad")}>{line}</span>
    );
  }
  if (/^DECISION:/.test(line)) {
    return <span className="font-bold text-warn">{line}</span>;
  }
  return <span>{line}</span>;
}

function TextOutput({ text }: { text: string }) {
  const lines = text.replace(/\s+$/, "").split("\n");
  const isVerdict = lines.some((l) => l.startsWith("DECISION:"));
  return (
    <div
      className={cn(
        "flex gap-2.5 overflow-auto rounded-xl border px-3.5 py-3",
        isVerdict ? "border-warn/35 bg-warn/10" : "border-border bg-panel-2/50",
      )}
    >
      {isVerdict ? (
        <Gavel size={13} className="mt-0.5 shrink-0 text-warn" />
      ) : (
        <Terminal size={12} className="mt-0.5 shrink-0 text-ink-3" />
      )}
      <pre className="num min-w-0 flex-1 whitespace-pre-wrap font-mono text-[11.5px] leading-[1.7] text-ink-2">
        {lines.map((line, i) => (
          <span key={i}>
            <OutputLine line={line} />
            {i < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* code cell: collapsed terminal, outputs always visible                */
/* ------------------------------------------------------------------ */

/** Whole-line comment tinting only — robust, no tokenizer claims. */
function CodeLines({ source }: { source: string }) {
  const lines = source.split("\n");
  return (
    <pre className="max-h-[440px] overflow-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.75] text-slate-200">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-8 shrink-0 select-none pr-3 text-right text-[10px] leading-[1.95] text-slate-600">
            {i + 1}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 whitespace-pre",
              /^\s*#/.test(line) && "text-slate-500",
            )}
          >
            {line || " "}
          </span>
        </div>
      ))}
    </pre>
  );
}

function CodeCell({ cell }: { cell: NbCell }) {
  const [open, setOpen] = useState(false);
  const lines = cell.source.split("\n").length;
  const figures = cell.outputs?.filter((o) => o.kind === "image").length ?? 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3.5 py-2 transition-colors hover:bg-panel-2/60"
      >
        <span className="num rounded-md bg-navy px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
          In [{cell.execution_count ?? " "}]
        </span>
        <FileCode2 size={12} className="text-ink-3" />
        <span className="num text-[11px] text-ink-3">
          python · {lines} line{lines === 1 ? "" : "s"}
          {figures > 0 && ` · ${figures} figure${figures === 1 ? "" : "s"}`}
        </span>
        <span className="flex-1" />
        <span className="text-[10.5px] font-semibold text-ink-3">
          {open ? "hide code" : "show code"}
        </span>
        <ChevronDown
          size={13}
          className={cn("text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-[#0c1320]">
          <CodeLines source={cell.source} />
        </div>
      )}

      {cell.outputs && cell.outputs.length > 0 && (
        <div className="space-y-2.5 border-t border-border bg-bg-2/40 p-3">
          {cell.outputs.map((out, i) =>
            out.kind === "image" ? (
              <figure key={i} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${out.png}`}
                  alt="notebook figure"
                  className="mx-auto max-w-full p-2.5"
                />
              </figure>
            ) : out.kind === "error" ? (
              <div
                key={i}
                className="flex gap-2 overflow-auto rounded-xl border border-bad/30 bg-bad/10 px-3 py-2.5 text-bad"
              >
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                  {out.text}
                </pre>
              </div>
            ) : (
              <TextOutput key={i} text={out.text ?? ""} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* viewer: sticky numbered TOC + paper column                           */
/* ------------------------------------------------------------------ */

export function NotebookViewer() {
  const [cells, setCells] = useState<NbCell[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const cellRefs = useRef(new Map<number, HTMLDivElement>());

  useEffect(() => {
    fetch("/api/notebook")
      .then((r) => r.json())
      .then((j) => (j.cells ? setCells(j.cells) : setError(j.error)))
      .catch((e) => setError(e.message));
  }, []);

  const sections = useMemo(() => {
    if (!cells) return [];
    const out: { text: string; cellIndex: number; level: 1 | 2 }[] = [];
    cells.forEach((c, i) => {
      if (c.type !== "markdown") return;
      const m = c.source.split("\n").find((l) => /^#{1,2} /.test(l));
      if (!m) return;
      out.push({
        text: m.replace(/^#+ /, "").trim(),
        cellIndex: i,
        level: m.startsWith("## ") ? 2 : 1,
      });
    });
    return out;
  }, [cells]);

  const figureCount = useMemo(
    () =>
      cells?.reduce(
        (acc, c) => acc + (c.outputs?.filter((o) => o.kind === "image").length ?? 0),
        0,
      ) ?? 0,
    [cells],
  );

  /* track the section currently in view */
  useEffect(() => {
    if (!cells || sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.cellIndex);
          const section = [...sections].reverse().find((s) => s.cellIndex <= idx);
          if (section) setActive(section.cellIndex);
        }
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    cellRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [cells, sections]);

  if (error) {
    return <div className="card p-6 text-[13px] text-bad">Notebook unavailable: {error}</div>;
  }
  if (!cells) return <div className="skeleton h-96 w-full" />;

  const jump = (cellIndex: number) =>
    cellRefs.current.get(cellIndex)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
      {/* ---------- sticky study outline (desktop) ---------- */}
      <aside className="hidden lg:block">
        <div className="card sticky top-4 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-panel-2/60 px-3.5 py-2.5">
            <BookOpenText size={13} className="text-brand" />
            <span className="text-[11.5px] font-bold text-ink">Study outline</span>
          </div>
          <nav className="max-h-[64vh] space-y-0.5 overflow-y-auto p-2">
            {sections.map((s, i) => {
              const isActive = active === s.cellIndex;
              const label = s.level === 1 ? "Abstract" : s.text;
              return (
                <button
                  key={s.cellIndex}
                  onClick={() => jump(s.cellIndex)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] leading-snug transition-colors",
                    isActive
                      ? "bg-brand-soft font-semibold text-brand"
                      : "text-ink-2 hover:bg-panel-2 hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "num mt-px shrink-0 font-mono text-[10px] font-bold",
                      isActive ? "text-brand" : "text-ink-3",
                    )}
                  >
                    {s.level === 1 ? "§" : String(i).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    {label.length > 52 ? `${label.slice(0, 52)}…` : label}
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="num border-t border-border bg-panel-2/40 px-3.5 py-2 font-mono text-[10px] text-ink-3">
            {cells.length} cells · {figureCount} figures · executed end to end
          </div>
        </div>
      </aside>

      {/* ---------- mobile outline ---------- */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1.5 overflow-x-auto bg-bg/85 px-1 py-2 backdrop-blur lg:hidden">
        {sections.map((s, i) => (
          <button
            key={s.cellIndex}
            onClick={() => jump(s.cellIndex)}
            className={cn(
              "tag shrink-0 transition-colors",
              active === s.cellIndex
                ? "border-brand-2/50 bg-brand-soft text-brand"
                : "hover:border-brand-2 hover:bg-brand-soft hover:text-brand",
            )}
          >
            {s.level === 1 ? "Abstract" : `${i}. ${s.text.split(",")[0].split(":")[0]}`}
          </button>
        ))}
      </div>

      {/* ---------- the paper ---------- */}
      <div className="min-w-0 space-y-4">
        {cells.map((cell, i) => (
          <div
            key={i}
            data-cell-index={i}
            ref={(el) => {
              if (el) cellRefs.current.set(i, el);
            }}
            className="scroll-mt-16"
          >
            {cell.type === "markdown" ? (
              i === 0 ? (
                <div className="card accent-top px-5 py-4 [&_.prose-chat]:text-[13.5px] [&_.prose-chat_h1]:text-[1.5em]">
                  <Markdown>{cell.source}</Markdown>
                </div>
              ) : (
                <div className="px-1 pt-2 [&_.prose-chat]:text-[13.5px]">
                  <Markdown>{cell.source}</Markdown>
                </div>
              )
            ) : (
              <CodeCell cell={cell} />
            )}
          </div>
        ))}

        <div className="flex items-center justify-center gap-2 pb-2 pt-4 text-[11px] text-ink-3">
          <BookOpenText size={12} />
          End of study. The Train &amp; benchmark tab reruns this comparison live, in the browser.
        </div>
      </div>
    </div>
  );
}
