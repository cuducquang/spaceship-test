"use client";

import { useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  NotebookPen,
  Search,
  TrendingUp,
  Wrench,
  X,
} from "lucide-react";
import type { ToolUiPayload } from "@/lib/agent/events";
import { cn } from "@/lib/utils";
import { PayloadBlock } from "./blocks";
import { HumanInput } from "./human-input";

const TOOL_META: Record<string, { label: string; icon: typeof Wrench }> = {
  query_orders: { label: "Querying orders", icon: Search },
  forecast_demand: { label: "Forecasting demand", icon: TrendingUp },
  create_chart: { label: "Building chart", icon: TrendingUp },
  generate_image: { label: "Generating image", icon: ImageIcon },
  knowledge_list: { label: "Listing knowledge", icon: NotebookPen },
  knowledge_read: { label: "Reading knowledge", icon: NotebookPen },
  knowledge_write: { label: "Writing knowledge", icon: NotebookPen },
};

export interface ToolStepData {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  input?: unknown;
  summary?: string;
  error?: string;
  payload?: ToolUiPayload;
}

export function ToolStep({ step }: { step: ToolStepData }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_META[step.name] ?? { label: step.name, icon: Wrench };
  const Icon = meta.icon;

  const doneLabel = meta.label
    .replace(/^Querying/, "Queried")
    .replace(/^Forecasting/, "Forecast")
    .replace(/^Building/, "Built")
    .replace(/^Generating/, "Generated")
    .replace(/^Listing/, "Listed")
    .replace(/^Reading/, "Read")
    .replace(/^Writing/, "Wrote");

  return (
    <div className="my-1.5">
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-panel",
          step.status === "running" && "tool-stripe",
          step.status === "done" && "tool-stripe-done",
          step.status === "error" && "tool-stripe-error",
        )}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        >
          {step.status === "running" ? (
            <Loader2 size={13} className="shrink-0 animate-spin text-brand-2" />
          ) : step.status === "done" ? (
            <Check size={13} className="shrink-0 text-good" />
          ) : (
            <X size={13} className="shrink-0 text-bad" />
          )}
          <Icon size={13} className="shrink-0 text-ink-3" />
          <span className="text-[12.5px] font-semibold text-ink-2">
            {step.status === "running" ? meta.label : doneLabel}
          </span>
          {step.summary && step.status !== "running" && (
            <span className="truncate text-[11.5px] text-ink-3">· {step.summary}</span>
          )}
          <span className="flex-1" />
          <ChevronDown
            size={13}
            className={cn("shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")}
          />
        </button>

        {expanded && (
          <div className="border-t border-border bg-panel-2/40 px-3 py-2.5">
            <HumanInput input={step.input} />
            {step.error && (
              <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11.5px] text-rose-700">
                {step.error}
              </p>
            )}
          </div>
        )}
      </div>

      {step.payload && <PayloadBlock payload={step.payload} payloadKey={step.id} />}
    </div>
  );
}

export function ThinkingSection({ text, done }: { text: string; done: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-violet/20 bg-violet/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Brain size={13} className="shrink-0 text-violet" />
        <span className="text-[12px] font-semibold text-violet">
          {done ? "Reasoning" : "Thinking"}
        </span>
        {!done && (
          <span className="flex items-center gap-0.5">
            <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
            <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
            <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
          </span>
        )}
        <span className="flex-1" />
        <ChevronDown
          size={13}
          className={cn("shrink-0 text-violet/60 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <p className="whitespace-pre-wrap border-t border-violet/15 px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
          {text}
        </p>
      )}
    </div>
  );
}
