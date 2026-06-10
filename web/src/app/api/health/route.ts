import { getKnowledgeStore } from "@/lib/agent/knowledge-store";
import { getDataset } from "@/lib/data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataset = await getDataset();
    const knowledge = await getKnowledgeStore();
    return Response.json({
      ok: true,
      dataset: {
        source: dataset.info.source,
        rows: dataset.info.rowCount,
        dateRange: dataset.info.dateRange,
      },
      knowledge: { driver: knowledge.driver },
      agent: {
        model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
        imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image",
        anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
        geminiKey: Boolean(process.env.GEMINI_API_KEY),
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unhealthy" },
      { status: 500 },
    );
  }
}
