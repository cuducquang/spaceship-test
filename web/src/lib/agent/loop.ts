import Anthropic from "@anthropic-ai/sdk";
import { getChatModel } from "@/lib/chat-models";
import type { AgentEvent } from "./events";
import {
  clampHistory,
  executeTools,
  MAX_ITERATIONS,
  prepareAgent,
  summaryTurns,
  type AgentRunOptions,
} from "./shared";
import { toAnthropicTools } from "./tools";

export type { AgentRunOptions, ChatTurn } from "./shared";

/**
 * The agent harness: a streaming ReAct loop —
 *   user question → model interprets → tool selection → validated structured
 *   input → deterministic computation → result → explanation → visualization
 *
 * The agent always runs on Claude (Messages API); Gemini participates only
 * through the generate_image tool.
 */
export async function* runAgentTurn(opts: AgentRunOptions): AsyncGenerator<AgentEvent> {
  const model = getChatModel(opts.model);
  yield* runClaudeTurn(opts, model.id, model.thinkingDisplay ?? false);
}

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

async function* runClaudeTurn(
  opts: AgentRunOptions,
  modelId: string,
  thinkingDisplay: boolean,
): AsyncGenerator<AgentEvent> {
  const client = getClient();
  const prepared = await prepareAgent(opts.imageModel);
  const anthropicTools = toAnthropicTools(prepared.registry);

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: prepared.systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ];

  const preamble = opts.summary ? summaryTurns(opts.summary) : [];
  const messages: Anthropic.MessageParam[] = [
    ...preamble.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.content })),
    ...clampHistory(opts.history).map(
      (t): Anthropic.MessageParam => ({ role: t.role, content: t.content }),
    ),
    { role: "user", content: opts.userMessage },
  ];

  yield { type: "turn_start", model: modelId };

  // `display` is only supported on Opus 4.7+; older models take bare adaptive.
  const thinking: Anthropic.MessageCreateParams["thinking"] = thinkingDisplay
    ? { type: "adaptive", display: "summarized" }
    : { type: "adaptive" };

  let totalInput = 0;
  let totalOutput = 0;
  let lastContext = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: 4096,
        thinking,
        system,
        tools: anthropicTools,
        messages,
      },
      { signal: opts.signal },
    );

    let sawThinking = false;
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          yield { type: "tool_start", id: event.content_block.id, name: event.content_block.name };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text_delta", text: event.delta.text };
        } else if (event.delta.type === "thinking_delta" && event.delta.thinking) {
          sawThinking = true;
          yield { type: "thinking_delta", text: event.delta.thinking };
        }
      } else if (event.type === "content_block_stop" && sawThinking) {
        sawThinking = false;
        yield { type: "thinking_done" };
      }
    }

    const finalMessage = await stream.finalMessage();
    lastContext =
      finalMessage.usage.input_tokens +
      (finalMessage.usage.cache_read_input_tokens ?? 0) +
      (finalMessage.usage.cache_creation_input_tokens ?? 0);
    totalInput += lastContext;
    totalOutput += finalMessage.usage.output_tokens;

    if (finalMessage.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: finalMessage.content });
      continue;
    }

    const toolUses = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0 || finalMessage.stop_reason !== "tool_use") {
      yield {
        type: "done",
        usage: { input_tokens: totalInput, output_tokens: totalOutput, iterations: iteration, context_tokens: lastContext },
      };
      return;
    }

    messages.push({ role: "assistant", content: finalMessage.content });

    const executed = await executeTools(
      toolUses.map((tu) => ({ id: tu.id, name: tu.name, input: tu.input })),
      prepared,
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const result of executed) {
      yield result.event;
      toolResults.push(
        result.ok
          ? {
              type: "tool_result",
              tool_use_id: result.id,
              content: JSON.stringify(result.modelResult),
            }
          : {
              type: "tool_result",
              tool_use_id: result.id,
              content: `Error: ${result.error}`,
              is_error: true,
            },
      );
    }

    messages.push({ role: "user", content: toolResults });
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
