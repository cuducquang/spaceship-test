import { getDataset } from "@/lib/data/dataset";
import type { AgentEvent } from "./events";
import { getKnowledgeStore } from "./knowledge-store";
import { buildSystemPrompt } from "./system-prompt";
import {
  buildToolRegistry,
  type AgentTool,
  type StoredResult,
  type ToolContext,
} from "./tools";

/** Provider-agnostic setup shared by the Claude and Gemini agent loops. */

export const MAX_ITERATIONS = 8;
export const MAX_HISTORY_TURNS = 16;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRunOptions {
  model: string;
  history: ChatTurn[];
  userMessage: string;
  /** Compaction summary of earlier turns, injected ahead of the history. */
  summary?: string;
  signal?: AbortSignal;
}

export interface PreparedAgent {
  systemPrompt: string;
  registry: AgentTool[];
  byName: Map<string, AgentTool>;
  ctx: ToolContext;
}

export async function prepareAgent(): Promise<PreparedAgent> {
  const dataset = await getDataset();
  const knowledge = await getKnowledgeStore();
  const knowledgeEntries = await knowledge.list().catch(() => []);
  const registry = buildToolRegistry();
  return {
    systemPrompt: buildSystemPrompt(dataset, knowledgeEntries),
    registry,
    byName: new Map(registry.map((t) => [t.name, t])),
    ctx: { dataset, results: new Map<string, StoredResult>(), knowledge },
  };
}

/**
 * Compacted-summary handoff: a synthetic exchange placed before the visible
 * history so the model carries earlier context without re-reading it.
 */
export function summaryTurns(summary: string): ChatTurn[] {
  return [
    {
      role: "user",
      content: `<conversation_summary>\n${summary}\n</conversation_summary>\nEarlier turns of this conversation were compacted into the summary above. Treat it as established context (including any user preferences and exact figures) and continue seamlessly.`,
    },
    { role: "assistant", content: "Understood — I have the summarized context and will continue from there." },
  ];
}

export function clampHistory(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-MAX_HISTORY_TURNS).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 8000),
  }));
}

export interface ExecutedTool {
  id: string;
  name: string;
  input: unknown;
  ok: boolean;
  modelResult?: unknown;
  error?: string;
  event: AgentEvent;
}

/** Execute a batch of tool calls in parallel and build both API + UI results. */
export async function executeTools(
  calls: { id: string; name: string; input: unknown }[],
  prepared: PreparedAgent,
): Promise<ExecutedTool[]> {
  return Promise.all(
    calls.map(async (call): Promise<ExecutedTool> => {
      const tool = prepared.byName.get(call.name);
      try {
        if (!tool) throw new Error(`Unknown tool "${call.name}"`);
        const outcome = await tool.execute(call.input, prepared.ctx);
        return {
          ...call,
          ok: true,
          modelResult: outcome.modelResult,
          event: {
            type: "tool_result",
            id: call.id,
            name: call.name,
            ok: true,
            input: call.input,
            summary: outcome.summary,
            payload: outcome.payload,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ...call,
          ok: false,
          error: message,
          event: {
            type: "tool_result",
            id: call.id,
            name: call.name,
            ok: false,
            input: call.input,
            summary: "failed",
            error: message,
          },
        };
      }
    }),
  );
}
