/** Chat model registry — shared by the model selector UI and the agent API. */

export type ChatProvider = "anthropic" | "google";

export interface ChatModelInfo {
  id: string;
  label: string;
  provider: ChatProvider;
  hint: string;
  /** Anthropic models that accept thinking.display ("summarized"). */
  thinkingDisplay?: boolean;
}

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
    hint: "Previous-gen Opus",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    hint: "Fast · great value",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "google",
    hint: "Google's strongest",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "google",
    hint: "Stable pro tier",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "google",
    hint: "Fastest · cheapest",
  },
];

export const DEFAULT_CHAT_MODEL = "claude-opus-4-8";

export function getChatModel(id: string | undefined | null): ChatModelInfo {
  return CHAT_MODELS.find((m) => m.id === id) ?? CHAT_MODELS[0];
}

export function modelShortLabel(id: string): string {
  return getChatModel(id).label.replace("Claude ", "").replace("Gemini ", "G ");
}
