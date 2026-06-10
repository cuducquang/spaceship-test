import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "./supabase-key";

/**
 * Server-side conversation store on Supabase. When the tables are missing
 * (migration not run) every endpoint reports driver:"none" and the client
 * falls back to its localStorage store — the feature degrades, never breaks.
 */

export interface ConversationRow {
  id: string;
  title: string;
  model: string;
  summary: string | null;
  compacted_until: number;
  total_input_tokens: number;
  total_output_tokens: number;
  last_context_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  idx: number;
  role: "user" | "assistant";
  content: string;
  segments: unknown | null;
  created_at: string;
}

let cached: { client: SupabaseClient; available: boolean } | null = null;

export async function getChatDb(): Promise<SupabaseClient | null> {
  const config = getServerSupabaseConfig();
  if (!config) return null;
  if (cached) return cached.available ? cached.client : null;
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(config.url, config.key);
  const probe = await client.from("conversations").select("id").limit(1);
  cached = { client, available: !probe.error };
  return cached.available ? client : null;
}

/** Force re-probe (e.g. after the user runs the migration). */
export function resetChatDbCache() {
  cached = null;
}
