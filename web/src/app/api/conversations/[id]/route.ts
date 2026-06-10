import { NextRequest } from "next/server";
import { z } from "zod";
import { getChatDb } from "@/lib/server/chat-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none" }, { status: 503 });
  const { id } = await params;
  const [conv, msgs] = await Promise.all([
    db.from("conversations").select("*").eq("id", id).maybeSingle(),
    db
      .from("messages")
      .select("idx,role,content,segments,created_at")
      .eq("conversation_id", id)
      .order("idx", { ascending: true }),
  ]);
  if (conv.error) return Response.json({ error: conv.error.message }, { status: 500 });
  if (!conv.data) return Response.json({ error: "Not found" }, { status: 404 });
  if (msgs.error) return Response.json({ error: msgs.error.message }, { status: 500 });
  return Response.json({ conversation: conv.data, messages: msgs.data });
}

const PatchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  model: z.string().max(80).optional(),
  summary: z.string().max(12000).nullable().optional(),
  compacted_until: z.number().int().min(0).optional(),
  total_input_tokens: z.number().int().min(0).optional(),
  total_output_tokens: z.number().int().min(0).optional(),
  last_context_tokens: z.number().int().min(0).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none" }, { status: 503 });
  try {
    const { id } = await params;
    const patch = PatchSchema.parse(await req.json());
    const { data, error } = await db
      .from("conversations")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ conversation: data });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none" }, { status: 503 });
  const { id } = await params;
  const { error } = await db.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
