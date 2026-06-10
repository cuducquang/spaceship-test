import { NextRequest } from "next/server";
import { z } from "zod";
import { CHAT_MODELS, IMAGE_MODELS } from "@/lib/chat-models";
import { getSettings, saveSettings } from "@/lib/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    settings: await getSettings(),
    options: {
      agent_models: CHAT_MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint })),
      image_models: IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, hint: m.hint })),
    },
  });
}

const PutSchema = z.object({
  agent_model: z
    .string()
    .refine((m) => CHAT_MODELS.some((c) => c.id === m), "Unknown agent model")
    .optional(),
  image_model: z
    .string()
    .refine((m) => IMAGE_MODELS.some((c) => c.id === m), "Unknown image model")
    .optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const patch = PutSchema.parse(await req.json());
    const settings = await saveSettings(patch);
    return Response.json({ settings });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid settings" },
      { status: 400 },
    );
  }
}
