/**
 * Model registries — shared by the footer controls and the agent API.
 * The conversational agent runs on Claude; Gemini models handle image
 * generation only.
 */

export type ChatProvider = "anthropic" | "google";

export interface ChatModelInfo {
  id: string;
  label: string;
  provider: ChatProvider;
  hint: string;
  /** Anthropic models that accept thinking.display ("summarized"). */
  thinkingDisplay?: boolean;
}

/** Models eligible to power the agent (Claude only). */
export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    hint: "Most capable · default",
    thinkingDisplay: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "anthropic",
    hint: "Previous gen Opus",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    hint: "Fast · great value",
  },
];

/** Gemini models eligible for the generate_image tool. */
export interface ImageModelInfo {
  id: string;
  label: string;
  hint: string;
}

export const IMAGE_MODELS: ImageModelInfo[] = [
  { id: "gemini-3-pro-image", label: "Gemini 3 Pro Image", hint: "Best quality · default" },
  { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", hint: "Fast" },
  { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", hint: "Stable" },
];

export const DEFAULT_CHAT_MODEL = "claude-opus-4-8";
export const DEFAULT_IMAGE_MODEL = "gemini-3-pro-image";

/** Brand accent per provider, used for dots and chips across the UI. */
export const PROVIDER_COLORS: Record<ChatProvider, string> = {
  anthropic: "#d97757",
  google: "#4e8cff",
};

export function getChatModel(id: string | undefined | null): ChatModelInfo {
  return CHAT_MODELS.find((m) => m.id === id) ?? CHAT_MODELS[0];
}

export function getImageModel(id: string | undefined | null): ImageModelInfo {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0];
}

export function modelShortLabel(id: string): string {
  return getChatModel(id).label.replace("Claude ", "");
}
