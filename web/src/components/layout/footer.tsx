"use client";

import { useEffect, useState } from "react";
import { Database, NotebookPen, Cpu } from "lucide-react";

interface Health {
  dataset?: { source: string; rows: number; dateRange?: { from: string; to: string } };
  knowledge?: { driver: string };
  agent?: { model: string; imageModel?: string };
}

export function Footer() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => null);
  }, []);

  return (
    <footer className="z-30 flex h-9 shrink-0 items-center gap-5 overflow-x-auto whitespace-nowrap border-t border-border bg-panel/70 px-4 text-[11px] text-ink-3 backdrop-blur">
      <span className="flex items-center gap-1.5">
        <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
        <span className="font-semibold text-ink-2">System</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Database size={11} />
        {health?.dataset
          ? `${health.dataset.rows} orders · ${health.dataset.source} · ${health.dataset.dateRange?.from} → ${health.dataset.dateRange?.to}`
          : "dataset …"}
      </span>
      <span className="flex items-center gap-1.5">
        <NotebookPen size={11} />
        knowledge: {health?.knowledge?.driver ?? "…"}
      </span>
      <span className="flex items-center gap-1.5">
        <Cpu size={11} />
        default agent: {health?.agent?.model ?? "…"} · image: {health?.agent?.imageModel ?? "…"}
      </span>
      <span className="flex-1" />
      <span className="hidden lg:inline">
        Numbers are computed deterministically — AI only routes and explains
      </span>
    </footer>
  );
}
