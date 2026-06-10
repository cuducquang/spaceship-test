import { NextRequest } from "next/server";
import { z } from "zod";
import { getKnowledgeStore } from "@/lib/agent/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getKnowledgeStore();
    const files = await store.list();
    return Response.json({ driver: store.driver, files });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to list knowledge" },
      { status: 500 },
    );
  }
}

const WriteSchema = z.object({
  path: z.string(),
  content: z.string().max(20000),
  mode: z.enum(["append", "replace"]).default("replace"),
});

export async function POST(req: NextRequest) {
  try {
    const { path, content, mode } = WriteSchema.parse(await req.json());
    const store = await getKnowledgeStore();
    await store.write(path, content, mode);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to write" },
      { status: 400 },
    );
  }
}
