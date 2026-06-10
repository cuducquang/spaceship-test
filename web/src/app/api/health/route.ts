import { getKnowledgeStore } from "@/lib/agent/knowledge-store";
import { getDataset } from "@/lib/data/dataset";
import { getSettings } from "@/lib/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataset = await getDataset();
    const knowledge = await getKnowledgeStore();
    const settings = await getSettings();
    return Response.json({
      ok: true,
      dataset: {
        source: dataset.info.source,
        rows: dataset.info.rowCount,
        dateRange: dataset.info.dateRange,
      },
      knowledge: { driver: knowledge.driver },
      agent: {
        model: settings.agent_model,
        imageModel: settings.image_model,
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
