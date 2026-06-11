"use client";

import { createContext, useContext } from "react";
import type { ToolUiPayload } from "@/lib/agent/events";

export type CanvasKind = "chart" | "forecast" | "image";

export interface CanvasItem {
  key: string;
  kind: CanvasKind;
  title: string;
  payload: ToolUiPayload;
  ts: number;
}

export interface CanvasApi {
  /** Bring the canvas panel into view and highlight one item. */
  focus(key: string): void;
  /** Whether a given payload was routed to the canvas. */
  has(key: string): boolean;
}

export const CanvasContext = createContext<CanvasApi | null>(null);

export function useCanvas(): CanvasApi | null {
  return useContext(CanvasContext);
}

export function canvasKindOf(payload: ToolUiPayload): CanvasKind | null {
  if (payload.kind === "chart") return "chart";
  if (payload.kind === "forecast") return "forecast";
  if (payload.kind === "image") return "image";
  return null;
}

export function canvasTitleOf(payload: ToolUiPayload): string {
  switch (payload.kind) {
    case "chart":
      return payload.chart.title;
    case "forecast":
      return `Forecast: ${payload.result.target.used.value ?? "all orders"}`;
    case "image":
      return payload.prompt.length > 60 ? `${payload.prompt.slice(0, 60)}…` : payload.prompt;
    default:
      return "Visualization";
  }
}
