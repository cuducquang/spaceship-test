import { GoogleGenAI } from "@google/genai";

/**
 * Gemini image generation (the agent's `generate_image` tool).
 * Default model is the pro-tier image model of the Gemini 3 generation
 * (`gemini-3-pro-image`); override with GEMINI_IMAGE_MODEL. Falls back to the
 * flash image models if the preferred one is unavailable.
 */

const FALLBACK_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];

export interface GeneratedImage {
  dataUrl: string;
  model: string;
  note?: string;
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

async function tryGenerate(
  model: string,
  prompt: string,
  aspectRatio: string,
): Promise<GeneratedImage | null> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio },
    },
  });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  let note: string | undefined;
  for (const part of parts) {
    if (part.text) note = part.text.slice(0, 300);
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? "image/png";
      return { dataUrl: `data:${mime};base64,${part.inlineData.data}`, model, note };
    }
  }
  return null;
}

export async function generateImage(
  prompt: string,
  aspectRatio: string = "16:9",
): Promise<GeneratedImage> {
  const preferred = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
  const models = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
  let lastError: Error | null = null;
  for (const model of models) {
    try {
      const result = await tryGenerate(model, prompt, aspectRatio);
      if (result) return result;
      lastError = new Error(`${model} returned no image data`);
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw new Error(`Image generation failed: ${lastError?.message ?? "unknown error"}`);
}
