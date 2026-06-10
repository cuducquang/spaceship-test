"use client";

import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import type { ToolUiPayload } from "@/lib/agent/events";

/**
 * Conversation store, server side only. Every conversation and message lives
 * in Supabase (tables from supabase/migrations/0002_chat_history.sql) behind
 * the /api/conversations endpoints. When the tables are not provisioned the
 * store reports driver "none": chatting still works, persistence is simply
 * disabled and the history panel explains how to enable it.
 */

export interface StoredSegment {
  kind: "thinking" | "text" | "tool";
  text?: string;
  toolName?: string;
  toolStatus?: "done" | "error";
  toolSummary?: string;
  toolInput?: unknown;
  toolError?: string;
  payload?: ToolUiPayload;
}

export interface StoredMessage {
  role: "user" | "assistant";
  /** Plain text used as API history (user message or concatenated assistant text). */
  content: string;
  segments?: StoredSegment[];
  usage?: { input_tokens: number; output_tokens: number; iterations: number };
}

export interface ConversationMeta {
  id: string;
  title: string;
  model: string;
  summary: string | null;
  compacted_until: number;
  total_input_tokens: number;
  total_output_tokens: number;
  last_context_tokens: number;
  updated_at: string;
}

export interface ConversationData extends ConversationMeta {
  messages: StoredMessage[];
}

export interface ConversationPatch {
  title?: string;
  model?: string;
  summary?: string | null;
  compacted_until?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  last_context_tokens?: number;
}

export interface AppendableMessage {
  idx: number;
  role: "user" | "assistant";
  content: string;
  segments?: StoredSegment[];
  usage?: StoredMessage["usage"];
}

export interface ConversationsStore {
  driver: "supabase" | "none";
  list(): Promise<ConversationMeta[]>;
  get(id: string): Promise<ConversationData | null>;
  create(init: { title: string; model: string }): Promise<ConversationMeta | null>;
  update(id: string, patch: ConversationPatch): Promise<void>;
  remove(id: string): Promise<void>;
  appendMessages(id: string, messages: AppendableMessage[]): Promise<void>;
}

/* ------------------------------------------------------------------ */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

/** Normalize the jsonb `segments` column ({segments, usage} wrapper or legacy array). */
function normalizeMessage(m: {
  role: "user" | "assistant";
  content: string;
  segments: unknown;
}): StoredMessage {
  const wrapped = m.segments as
    | { segments?: StoredSegment[]; usage?: StoredMessage["usage"] }
    | StoredSegment[]
    | null;
  if (Array.isArray(wrapped)) return { role: m.role, content: m.content, segments: wrapped };
  return {
    role: m.role,
    content: m.content,
    segments: wrapped?.segments,
    usage: wrapped?.usage,
  };
}

function buildStore(driver: "supabase" | "none"): ConversationsStore {
  return {
    driver,
    async list() {
      if (driver === "none") return [];
      const json = await api<{ conversations: ConversationMeta[] }>("/api/conversations");
      return json.conversations;
    },
    async get(id) {
      if (driver === "none") return null;
      try {
        const json = await api<{
          conversation: ConversationMeta;
          messages: { role: "user" | "assistant"; content: string; segments: unknown }[];
        }>(`/api/conversations/${id}`);
        return { ...json.conversation, messages: json.messages.map(normalizeMessage) };
      } catch {
        return null;
      }
    },
    async create(init) {
      if (driver === "none") return null;
      try {
        const json = await api<{ conversation: ConversationMeta }>("/api/conversations", {
          method: "POST",
          body: JSON.stringify(init),
        });
        return json.conversation;
      } catch {
        return null;
      }
    },
    async update(id, patch) {
      if (driver === "none") return;
      await api(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }).catch(() => null);
    },
    async remove(id) {
      if (driver === "none") return;
      await api(`/api/conversations/${id}`, { method: "DELETE" });
    },
    async appendMessages(id, messages) {
      if (driver === "none") return;
      await api(`/api/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messages: messages.map((m) => ({
            idx: m.idx,
            role: m.role,
            content: m.content,
            segments:
              m.segments || m.usage
                ? { segments: m.segments ?? [], usage: m.usage ?? null }
                : undefined,
          })),
        }),
      }).catch(() => null);
    },
  };
}

/* ------------------------------------------------------------------ */

let resolved: ConversationsStore | null = null;
let resolving: Promise<ConversationsStore> | null = null;

export async function getConversationsStore(force = false): Promise<ConversationsStore> {
  if (force) {
    resolved = null;
    resolving = null;
  }
  if (resolved) return resolved;
  if (!resolving) {
    resolving = (async () => {
      try {
        const res = await fetch(`/api/conversations${force ? "?reprobe=1" : ""}`);
        const json = await res.json();
        resolved = buildStore(json.driver === "supabase" ? "supabase" : "none");
      } catch {
        resolved = buildStore("none");
      }
      return resolved;
    })();
  }
  return resolving;
}

export const DEFAULT_MODEL = DEFAULT_CHAT_MODEL;
