import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { z } from "zod";
import type { AgentEvent } from "./events";
import {
  clampHistory,
  executeTools,
  MAX_ITERATIONS,
  prepareAgent,
  summaryTurns,
  type AgentRunOptions,
} from "./shared";
import type { AgentTool } from "./tools";

/**
 * Gemini driver for the agent harness — identical tools, system prompt and
 * SSE event protocol as the Claude driver, implemented over @google/genai
 * function calling. Thought summaries map to thinking_delta events.
 */

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function toFunctionDeclarations(registry: AgentTool[]) {
  return registry.map((t) => {
    const schema = z.toJSONSchema(t.schema, { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      parametersJsonSchema: schema,
    };
  });
}

interface PendingCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  rawPart: Part;
}

export async function* runGeminiTurn(
  opts: AgentRunOptions,
  modelId: string,
): AsyncGenerator<AgentEvent> {
  const ai = getClient();
  const prepared = await prepareAgent();

  const preamble = opts.summary ? summaryTurns(opts.summary) : [];
  const contents: Content[] = [
    ...preamble.map(
      (t): Content => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }),
    ),
    ...clampHistory(opts.history).map(
      (t): Content => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] }),
    ),
    { role: "user", parts: [{ text: opts.userMessage }] },
  ];

  const config = {
    systemInstruction: prepared.systemPrompt,
    tools: [{ functionDeclarations: toFunctionDeclarations(prepared.registry) }],
    thinkingConfig: { includeThoughts: true },
    abortSignal: opts.signal,
  };

  yield { type: "turn_start", model: modelId };

  let totalInput = 0;
  let totalOutput = 0;
  let lastContext = 0;
  let callCounter = 0;
  const turnStamp = Date.now().toString(36);

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const stream = await ai.models.generateContentStream({ model: modelId, contents, config });

    const modelParts: Part[] = [];
    const calls: PendingCall[] = [];
    let sawThinking = false;
    let usage: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;

    for await (const chunk of stream) {
      usage = chunk.usageMetadata ?? usage;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          if (part.thought) {
            sawThinking = true;
            yield { type: "thinking_delta", text: part.text };
          } else {
            if (sawThinking) {
              sawThinking = false;
              yield { type: "thinking_done" };
            }
            yield { type: "text_delta", text: part.text };
            const last = modelParts[modelParts.length - 1];
            if (last?.text !== undefined && !last.thoughtSignature && !part.thoughtSignature) {
              last.text += part.text;
            } else {
              modelParts.push({ ...part });
            }
          }
        }
        if (part.functionCall?.name) {
          callCounter += 1;
          const id = part.functionCall.id || `gem_${turnStamp}_${iteration}_${callCounter}`;
          calls.push({
            id,
            name: part.functionCall.name,
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
            rawPart: { ...part },
          });
          yield { type: "tool_start", id, name: part.functionCall.name };
        }
      }
    }
    if (sawThinking) yield { type: "thinking_done" };

    lastContext = usage?.promptTokenCount ?? lastContext;
    totalInput += usage?.promptTokenCount ?? 0;
    totalOutput += (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);

    if (calls.length === 0) {
      yield {
        type: "done",
        usage: { input_tokens: totalInput, output_tokens: totalOutput, iterations: iteration, context_tokens: lastContext },
      };
      return;
    }

    // model turn (text + function calls, preserving thought signatures)
    contents.push({
      role: "model",
      parts: [...modelParts, ...calls.map((c) => c.rawPart)],
    });

    const executed = await executeTools(
      calls.map((c) => ({ id: c.id, name: c.name, input: c.input })),
      prepared,
    );

    const responseParts: Part[] = [];
    for (const result of executed) {
      yield result.event;
      const call = calls.find((c) => c.id === result.id);
      responseParts.push({
        functionResponse: {
          ...(call?.rawPart.functionCall?.id ? { id: call.rawPart.functionCall.id } : {}),
          name: result.name,
          response: result.ok
            ? { result: result.modelResult }
            : { error: result.error ?? "tool failed" },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  yield {
    type: "error",
    message: `Stopped after ${MAX_ITERATIONS} tool iterations — try a more specific question.`,
  };
  yield {
    type: "done",
    usage: { input_tokens: totalInput, output_tokens: totalOutput, iterations: MAX_ITERATIONS, context_tokens: lastContext },
  };
}
