import { getKnowledgeStore } from "@/lib/agent/knowledge-store";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODELS,
} from "@/lib/chat-models";

/**
 * App settings, persisted server side as a hidden document in the knowledge
 * store (Supabase in production, filesystem in dev). Hidden paths (prefix "_")
 * never show up in knowledge listings or agent tools.
 */

const SETTINGS_PATH = "_app/settings.json";

export interface AppSettings {
  agent_model: string;
  image_model: string;
}

function defaults(): AppSettings {
  return {
    agent_model: process.env.ANTHROPIC_MODEL || DEFAULT_CHAT_MODEL,
    image_model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  };
}

function validate(settings: Partial<AppSettings>): AppSettings {
  const base = defaults();
  return {
    agent_model: CHAT_MODELS.some((m) => m.id === settings.agent_model)
      ? (settings.agent_model as string)
      : base.agent_model,
    image_model: IMAGE_MODELS.some((m) => m.id === settings.image_model)
      ? (settings.image_model as string)
      : base.image_model,
  };
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const store = await getKnowledgeStore();
    const raw = await store.read(SETTINGS_PATH);
    if (!raw) return defaults();
    return validate(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return defaults();
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = validate({ ...(await getSettings()), ...patch });
  const store = await getKnowledgeStore();
  await store.write(SETTINGS_PATH, JSON.stringify(next, null, 2), "replace");
  return next;
}
