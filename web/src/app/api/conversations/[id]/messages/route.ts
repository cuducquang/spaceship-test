import { NextRequest } from "next/server";
import { z } from "zod";
import { getChatDb } from "@/lib/server/chat-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const AppendSchema = z.object({
  messages: z
    .array(
      z.object({
        idx: z.number().int().min(0),
        role: z.enum(["user", "assistant"]),
        content: z.string().max(40000),
        segments: z.unknown().optional(),
      }),
    )
    .min(1)
    .max(10),
});

/** Append a batch of messages (one user + one assistant per turn, typically). */
export async function POST(req: NextRequest, { params }: Params) {
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none" }, { status: 503 });
  try {
    const { id } = await params;
    const body = AppendSchema.parse(await req.json());
    const rows = body.messages.map((m) => ({
      conversation_id: id,
      idx: m.idx,
      role: m.role,
      content: m.content,
      segments: m.segments ?? null,
    }));
    const { error } = await db
      .from("messages")
      .upsert(rows, { onConflict: "conversation_id,idx" });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Append failed" },
      { status: 400 },
    );
  }
}
