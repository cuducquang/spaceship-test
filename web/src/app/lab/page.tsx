"use client";

import { useState } from "react";
import { BookOpenText, FlaskConical } from "lucide-react";
import { Benchmark } from "@/components/lab/benchmark";
import { NotebookViewer } from "@/components/lab/notebook-viewer";
import { cn } from "@/lib/utils";

export default function LabPage() {
  const [tab, setTab] = useState<"train" | "notebook">("train");

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="aurora" aria-hidden />
      <div className="mx-auto max-w-[980px] px-6 py-6 pb-16">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 shadow-md shadow-amber-500/25">
                <FlaskConical size={18} className="text-white" />
              </span>
              ML Lab
            </h1>
            <span className="terminal flex items-center gap-2 rounded-xl px-3.5 py-2 text-[11px]">
              <span className="text-emerald-300">$</span>
              <span className="text-white/70">offline_study</span>
              <span className="text-white/30">·</span>
              AUC <span className="font-bold text-amber-300">0.465</span>
              <span className="text-white/30">·</span>
              p <span className="font-bold text-amber-300">0.68</span>
              <span className="text-white/30">·</span>
              <span className="font-bold text-rose-300">NO-SHIP</span>
              <span className="caret-blink text-emerald-300">▍</span>
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-3">
            Train and benchmark late-delivery classifiers right here — on the bundled dataset or
            your own CSV — with leakage-safe cross-validation. Each model fits live, one after
            another. The AI analyst can run this same benchmark in chat (the{" "}
            <code className="rounded bg-panel-2 px-1 py-0.5 text-[11px]">evaluate_ml_models</code>{" "}
            tool); what stays unshipped — per the notebook's pre-registered decision — is
            per-order risk prediction. The Notebook tab is that full offline study, rendered
            block by block.
          </p>
        </header>

        {/* tabs */}
        <div className="mb-6 flex gap-1.5">
          {(
            [
              { id: "train", label: "Train & benchmark", icon: FlaskConical },
              { id: "notebook", label: "Research notebook", icon: BookOpenText },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all",
                tab === t.id
                  ? "bg-navy text-white shadow-md shadow-navy/20"
                  : "bg-panel text-ink-2 hover:bg-panel-2",
              )}
            >
              <t.icon size={14} className={tab === t.id ? "text-emerald-300" : ""} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "train" ? <Benchmark /> : <NotebookViewer />}
      </div>
    </div>
  );
}
