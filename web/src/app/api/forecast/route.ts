import { NextRequest } from "next/server";
import { runForecast } from "@/lib/analytics/forecast";
import { ForecastSpecSchema } from "@/lib/analytics/specs";
import { getDataset } from "@/lib/data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Direct forecasting endpoint used by the Forecast page (same engine the agent uses). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const spec = ForecastSpecSchema.parse(body.spec ?? body);
    const dataset = await getDataset();
    const result = runForecast(dataset.orders, spec);
    return Response.json({ result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid forecast spec" },
      { status: 400 },
    );
  }
}
