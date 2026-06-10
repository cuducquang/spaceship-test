import { getDataset } from "@/lib/data/dataset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dataset metadata for filter dropdowns and date pickers. */
export async function GET() {
  const dataset = await getDataset();
  return Response.json({ info: dataset.info });
}
