"use client";

import { useState } from "react";
import { BookOpenText, FlaskConical, ShieldX } from "lucide-react";
import { Benchmark } from "@/components/lab/benchmark";
import { NotebookViewer } from "@/components/lab/notebook-viewer";
import { cn } from "@/lib/utils";

export default function LabPage() {
  const [tab, setTab] = useState<"train" | "notebook">("train");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-6 py-6 pb-16">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
              <FlaskConical className="text-brand" size={24} />
              ML Lab
            </h1>
            <span className="tag border-amber-300 bg-amber-50 text-amber-800">
              <ShieldX size={11} />
              offline verdict: no-ship · AUC 0.465 · p = 0.68
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-3">
            Train and benchmark late-delivery classifiers right here — on the bundled dataset or
            your own CSV — with leakage-safe cross-validation. The Notebook tab is the full
            offline study, rendered block by block, that led to the honest decision NOT to ship a
            prediction tool to the agent.
          </p>
        </header>

        {/* tabs */}
        <div className="mb-5 flex gap-1.5">
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
