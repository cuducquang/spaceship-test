import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conversation compaction: summarize earlier turns with a small fast model so
 * long sessions keep their context without resending every message.
 */

const BodySchema = z.object({
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(2)
    .max(80),
  prior_summary: z.string().max(8000).optional(),
});

const COMPACT_SYSTEM = `You compress analytics conversations into briefing notes for the analyst who will continue the session. Produce a tight markdown summary (max ~250 words) with these sections, omitting empty ones:
- **Goals**: what the user is trying to understand or decide.
- **Established facts**: exact figures already computed (keep numbers verbatim, with their time windows and denominators).
- **Preferences**: anything the user asked for about style, scope or format.
- **Open threads**: pending follow-ups or unanswered questions.
Never invent numbers; only carry over what appears in the transcript.`;

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
    }
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const transcript = body.turns
      .map((t) => `${t.role === "user" ? "User" : "Analyst"}: ${t.content.slice(0, 2500)}`)
      .join("\n\n");

    const prompt = body.prior_summary
      ? `An earlier portion of this conversation was already summarized:\n<previous_summary>\n${body.prior_summary}\n</previous_summary>\n\nMerge it with the new turns below into ONE updated summary.\n\n<new_turns>\n${transcript}\n</new_turns>`
      : `Summarize this conversation:\n\n<turns>\n${transcript}\n</turns>`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      system: COMPACT_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return Response.json({
      summary,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Compaction failed" },
      { status: 400 },
    );
  }
}
