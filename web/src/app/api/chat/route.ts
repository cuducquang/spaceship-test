import { NextRequest } from "next/server";
import { z } from "zod";
import { encodeSse } from "@/lib/agent/events";
import { runAgentTurn } from "@/lib/agent/loop";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from "@/lib/chat-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(40)
    .default([]),
  model: z
    .string()
    .refine((m) => CHAT_MODELS.some((c) => c.id === m), "Unknown model")
    .default(DEFAULT_CHAT_MODEL),
  /** Compaction summary of earlier (dropped) turns. */
  summary: z.string().max(8000).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgentTurn({
          model: body.model,
          history: body.history,
          userMessage: body.message,
          summary: body.summary,
          signal: req.signal,
        })) {
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent failed unexpectedly";
        try {
          controller.enqueue(encoder.encode(encodeSse({ type: "error", message })));
        } catch {
          /* stream already closed */
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
