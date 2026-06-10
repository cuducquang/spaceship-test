import { NextRequest } from "next/server";
import { runQuery } from "@/lib/analytics/engine";
import { QuerySpecSchema } from "@/lib/analytics/specs";
import { getDataset } from "@/lib/data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Direct structured-query endpoint used by the dashboard (same engine the agent uses). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const spec = QuerySpecSchema.parse(body.spec ?? body);
    const dataset = await getDataset();
    const result = runQuery(dataset.orders, spec, {
      datasetMinDate: dataset.info.dateRange.from,
      datasetMaxDate: dataset.info.dateRange.to,
    });
    return Response.json({ result, dataset: { source: dataset.info.source } });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid query" },
      { status: 400 },
    );
  }
}
