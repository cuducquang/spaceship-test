import { NextRequest } from "next/server";
import { getKnowledgeStore } from "@/lib/agent/knowledge-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { path } = await params;
    const store = await getKnowledgeStore();
    const content = await store.read(decodeURIComponent(path));
    if (content === null) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ path: decodeURIComponent(path), content });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to read" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { path } = await params;
    const store = await getKnowledgeStore();
    await store.remove(decodeURIComponent(path));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete" },
      { status: 400 },
    );
  }
}
