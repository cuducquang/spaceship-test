"use client";

import { useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Image as ImageIcon,
  LineChart,
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

/**
 * The agent's work rendered as a living pipeline: each reasoning phase and
 * tool call is a node on a connected rail. Running nodes pulse, completed
 * nodes settle green — the loop is visible, not implied.
 */

const TOOL_META: Record<string, { run: string; done: string; icon: typeof Wrench }> = {
  query_orders: { run: "Querying orders", done: "Queried orders", icon: Search },
  forecast_demand: { run: "Forecasting demand", done: "Forecast ready", icon: TrendingUp },
  create_chart: { run: "Building chart", done: "Chart built", icon: LineChart },
  generate_image: { run: "Generating image", done: "Image generated", icon: ImageIcon },
  knowledge_list: { run: "Listing knowledge", done: "Knowledge listed", icon: NotebookPen },
  knowledge_read: { run: "Reading knowledge", done: "Knowledge read", icon: NotebookPen },
  knowledge_write: { run: "Writing knowledge", done: "Knowledge saved", icon: NotebookPen },
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
  const meta = TOOL_META[step.name] ?? { run: step.name, done: step.name, icon: Wrench };
  const Icon = meta.icon;

  return (
    <div className="pipe-row pb-3">
      <span className="pipe-line" />
      <span
        className={cn(
          "pipe-node",
          step.status === "running" && "pipe-node-running",
          step.status === "done" && "pipe-node-done",
          step.status === "error" && "pipe-node-error",
        )}
      >
        {step.status === "running" ? (
          <Loader2 size={13} className="animate-spin text-brand-2" />
        ) : step.status === "error" ? (
          <X size={13} className="text-bad" />
        ) : (
          <Icon size={13} className="text-good" />
        )}
      </span>

      <div className="overflow-hidden rounded-xl border border-border bg-panel/85 shadow-sm backdrop-blur-[2px]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <span
            className={cn(
              "text-[12.5px] font-semibold",
              step.status === "running" ? "shimmer-text" : "text-ink",
            )}
          >
            {step.status === "running" ? meta.run : meta.done}
          </span>
          {step.summary && step.status !== "running" && (
            <span className="min-w-0 truncate text-[11.5px] text-ink-3">· {step.summary}</span>
          )}
          {step.status === "done" && (
            <Check size={11} strokeWidth={3} className="shrink-0 text-good/70" />
          )}
          <span className="flex-1" />
          <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-ink-3">
            {step.name}
          </span>
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
    <div className="pipe-row pb-3">
      <span className="pipe-line" />
      <span
        className={cn(
          "pipe-node",
          !done && "pipe-node-running !border-violet/50",
        )}
        style={!done ? { animationName: "nodePulse" } : undefined}
      >
        <Brain size={13} className="text-violet" />
      </span>

      <div className="overflow-hidden rounded-xl border border-violet/20 bg-violet/[0.04] backdrop-blur-[2px]">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <span
            className={cn(
              "text-[12.5px] font-semibold",
              done ? "text-violet" : "shimmer-text",
            )}
          >
            {done ? "Reasoned" : "Thinking"}
          </span>
          {!done && (
            <span className="flex items-center gap-0.5">
              <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
              <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
              <span className="typing-dot h-1 w-1 rounded-full bg-violet" />
            </span>
          )}
          {done && (
            <span className="text-[10.5px] text-ink-3">
              {Math.max(1, Math.round(text.length / 5))} words of internal reasoning
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
    </div>
  );
}
