import { NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { getChatDb, resetChatDbCache } from "@/lib/server/chat-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List conversations (newest first). driver:"none" → client uses localStorage. */
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("reprobe") === "1") resetChatDbCache();
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none", conversations: [] });
  const { data, error } = await db
    .from("conversations")
    .select(
      "id,title,model,summary,compacted_until,total_input_tokens,total_output_tokens,last_context_tokens,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ driver: "supabase", conversations: data });
}

const CreateSchema = z.object({
  title: z.string().min(1).max(120).default("New conversation"),
  model: z.string().max(80).default(DEFAULT_CHAT_MODEL),
});

export async function POST(req: NextRequest) {
  const db = await getChatDb();
  if (!db) return Response.json({ driver: "none" }, { status: 503 });
  try {
    const body = CreateSchema.parse(await req.json().catch(() => ({})));
    const { data, error } = await db
      .from("conversations")
      .insert({ title: body.title, model: body.model })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return Response.json({ conversation: data });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 400 },
    );
  }
}
