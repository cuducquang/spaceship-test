"use client";

import { useEffect, useState } from "react";
import { Cpu, Database, Image as ImageIcon, NotebookPen } from "lucide-react";

interface Health {
  dataset?: { source: string; rows: number; dateRange?: { from: string; to: string } };
  knowledge?: { driver: string };
  agent?: { model: string; imageModel?: string };
}

function Seg({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: string;
}) {
  return (
    <span className="group flex shrink-0 items-center gap-1.5 transition-colors">
      <Icon size={11} className="text-white/35 transition-colors group-hover:text-emerald-300/80" />
      <span className="text-white/40">{label}</span>
      <span className="font-mono text-[10.5px] font-medium text-white/75">{value}</span>
    </span>
  );
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
    <footer className="z-30 shrink-0">
      <div className="hairline" />
      <div className="flex h-9 items-center gap-5 overflow-x-auto whitespace-nowrap bg-[#0b2230] px-4 text-[11px]">
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="font-semibold text-emerald-200/90">
            {health ? "All systems live" : "Connecting"}
          </span>
        </span>
        <span className="h-3.5 w-px shrink-0 bg-white/10" />
        <Seg
          icon={Database}
          label="data"
          value={
            health?.dataset
              ? `${health.dataset.rows} orders · ${health.dataset.source}`
              : "…"
          }
        />
        <Seg
          icon={NotebookPen}
          label="knowledge"
          value={health?.knowledge?.driver ?? "…"}
        />
        <Seg icon={Cpu} label="agent" value={health?.agent?.model ?? "…"} />
        <Seg icon={ImageIcon} label="image" value={health?.agent?.imageModel ?? "…"} />
        <span className="flex-1" />
        <span className="hidden shrink-0 font-mono text-[10px] text-white/30 lg:inline">
          AI routes · engines compute · window {health?.dataset?.dateRange?.from ?? "…"} →{" "}
          {health?.dataset?.dateRange?.to ?? "…"}
        </span>
      </div>
    </footer>
  );
}
