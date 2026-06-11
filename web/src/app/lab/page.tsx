"use client";

import { useState } from "react";
import { BookOpenText, FlaskConical } from "lucide-react";
import { Benchmark } from "@/components/lab/benchmark";
import { NotebookViewer } from "@/components/lab/notebook-viewer";
import { cn } from "@/lib/utils";

export default function LabPage() {
  const [tab, setTab] = useState<"train" | "notebook">("train");

  return (
    <div className="relative h-full overflow-y-auto overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="aurora" />
      </div>
      <div className="mx-auto max-w-[1180px] px-6 py-6 pb-16">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 shadow-md shadow-amber-500/25">
                <FlaskConical size={18} className="text-white" />
              </span>
              ML Lab
            </h1>
            <span className="tag border-warn/30 bg-warn/10 !py-1.5 text-warn" title="The offline research study scored AUC 0.465 (chance is 0.5) with permutation p 0.68, so per order late risk predictions are not shipped.">
              Research verdict: late deliveries are not predictable from this data (AUC 0.465, p 0.68), so no risk scoring is shipped
            </span>
          </div>
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
                  ? "bg-brand-2 text-white shadow-md shadow-brand-2/25"
                  : "bg-panel text-ink-2 hover:bg-panel-2",
              )}
            >
              <t.icon size={14} className={tab === t.id ? "text-cyan-200" : ""} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "train" ? <Benchmark /> : <NotebookViewer />}
      </div>
    </div>
  );
}
