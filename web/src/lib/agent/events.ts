import type { ForecastResult } from "@/lib/analytics/forecast";
import type { ChartType, QueryResult } from "@/lib/analytics/specs";

/**
 * SSE protocol between the agent loop and the chat UI.
 * Every event is one `data: <json>\n\n` frame.
 */

export interface ChartPayloadData {
  type: ChartType;
  title: string;
  subtitle?: string;
  x: string;
  series: string[];
  line_series?: string[];
  value_format?: "number" | "percent" | "currency" | "days";
  /** Column metadata + resolved rows, inlined so the UI never needs a second fetch. */
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | boolean | null>[];
}

export type ToolUiPayload =
  | {
      kind: "query_result";
      result: QueryResult;
      /** Up to 25 raw matching orders, for the "underlying data" view. */
      sample_orders: Record<string, string | number | boolean | null>[];
    }
  | { kind: "forecast"; result: ForecastResult }
  | { kind: "chart"; chart: ChartPayloadData }
  | { kind: "image"; data_url: string; prompt: string; model: string; aspect_ratio: string }
  | { kind: "knowledge_list"; files: { path: string; bytes: number; updated_at: string }[] }
  | { kind: "knowledge_read"; path: string; content: string }
  | { kind: "knowledge_write"; path: string; mode: "append" | "replace"; content: string }
  | { kind: "ml_prediction"; probability: number; risk_band: string; drivers: { feature: string; effect: number }[] };

export type AgentEvent =
  | { type: "turn_start"; model: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_done" }
  | { type: "tool_start"; id: string; name: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      input: unknown;
      summary: string;
      error?: string;
      payload?: ToolUiPayload;
    }
  | {
      type: "done";
      usage: {
        input_tokens: number;
        output_tokens: number;
        iterations: number;
        /** Prompt size of the final model call — the real "context fullness". */
        context_tokens: number;
      };
    }
  | { type: "error"; message: string };

export function encodeSse(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
