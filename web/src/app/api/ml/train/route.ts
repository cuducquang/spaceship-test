import { NextRequest } from "next/server";
import { z } from "zod";
import { MODEL_KINDS, runBenchmark } from "@/lib/ml/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(40).max(5000),
  target: z.string().min(1),
  positive: z.string().min(1),
  features: z
    .array(z.object({ name: z.string().min(1), kind: z.enum(["numeric", "categorical"]) }))
    .min(1)
    .max(25),
  models: z.array(z.enum(MODEL_KINDS)).min(1).max(4),
  folds: z.union([z.literal(3), z.literal(5)]).default(5),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    if (body.features.some((f) => f.name === body.target)) {
      return Response.json(
        { error: "The target column cannot also be a feature (that's leakage)." },
        { status: 400 },
      );
    }
    const result = runBenchmark(body);
    return Response.json({ result });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Training failed" },
      { status: 400 },
    );
  }
}
