"use client";

import { useEffect, useState } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronUp, Cpu, Database, Image as ImageIcon, NotebookPen } from "lucide-react";
import {
  CHAT_MODELS,
  IMAGE_MODELS,
  PROVIDER_COLORS,
  getChatModel,
  getImageModel,
} from "@/lib/chat-models";
import { cn } from "@/lib/utils";

interface Health {
  dataset?: { source: string; rows: number; dateRange?: { from: string; to: string } };
  knowledge?: { driver: string };
}

interface Settings {
  agent_model: string;
  image_model: string;
}

export const SETTINGS_EVENT = "spaceship:settings";

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

/** Compact dark dropdown for the status bar — opens upward. */
function ChromeSelect({
  icon: Icon,
  label,
  value,
  valueLabel,
  dotColor,
  options,
  onChange,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  valueLabel: string;
  dotColor: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Icon size={11} className="text-white/35" />
      <span className="text-white/40">{label}</span>
      <SelectPrimitive.Root value={value} onValueChange={onChange}>
        <SelectPrimitive.Trigger
          aria-label={`${label} model`}
          className={cn(
            "group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-white/80 outline-none transition-colors",
            "hover:bg-white/8 hover:text-emerald-200 focus-visible:bg-white/8",
            "data-[state=open]:bg-white/8 data-[state=open]:text-emerald-200",
          )}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}
          />
          {valueLabel}
          <ChevronUp
            size={10}
            className="text-white/35 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            side="top"
            sideOffset={8}
            align="end"
            className={cn(
              "z-50 min-w-[230px] overflow-hidden rounded-xl border border-border bg-panel shadow-[var(--shadow-lift)]",
              "data-[state=open]:animate-[blockEnter_0.18s_ease]",
            )}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                {label} model
              </div>
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-3 pr-8 text-[13px] text-ink outline-none transition-colors",
                    "data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand",
                    "data-[state=checked]:font-semibold",
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: dotColor }}
                  />
                  <div className="min-w-0">
                    <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                    {o.hint && (
                      <div className="truncate text-[10.5px] font-normal text-ink-3">{o.hint}</div>
                    )}
                  </div>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                    <Check size={13} className="text-brand" strokeWidth={3} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </span>
  );
}

export function Footer() {
  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => null);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => null);
  }, []);

  const update = (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => null);
  };

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
        {settings ? (
          <>
            <ChromeSelect
              icon={Cpu}
              label="agent"
              value={settings.agent_model}
              valueLabel={getChatModel(settings.agent_model).label}
              dotColor={PROVIDER_COLORS.anthropic}
              options={CHAT_MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint }))}
              onChange={(v) => update({ agent_model: v })}
            />
            <ChromeSelect
              icon={ImageIcon}
              label="image"
              value={settings.image_model}
              valueLabel={getImageModel(settings.image_model).label}
              dotColor={PROVIDER_COLORS.google}
              options={IMAGE_MODELS.map((m) => ({ value: m.id, label: m.label, hint: m.hint }))}
              onChange={(v) => update({ image_model: v })}
            />
          </>
        ) : (
          <>
            <Seg icon={Cpu} label="agent" value="…" />
            <Seg icon={ImageIcon} label="image" value="…" />
          </>
        )}
        <span className="flex-1" />
        <span className="hidden shrink-0 font-mono text-[10px] text-white/30 lg:inline">
          AI routes · engines compute · window {health?.dataset?.dateRange?.from ?? "…"} →{" "}
          {health?.dataset?.dateRange?.to ?? "…"}
        </span>
      </div>
    </footer>
  );
}
