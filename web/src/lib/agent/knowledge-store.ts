import fs from "node:fs";
import path from "node:path";

/**
 * The agent's evolving "knowledge filesystem" — small markdown files it can
 * list, read and write (append or replace) across conversations.
 *
 * Drivers, in order of preference:
 *  1. Supabase `knowledge_files` table (persistent in production)
 *  2. Local filesystem `data/knowledge/` (persistent in local dev)
 *  3. In-memory map seeded from the bundled files (ephemeral fallback so the
 *     feature still works on serverless without Supabase)
 */

export interface KnowledgeEntry {
  path: string;
  bytes: number;
  updated_at: string;
  preview: string;
}

export interface KnowledgeStore {
  driver: "supabase" | "local-fs" | "memory";
  list(): Promise<KnowledgeEntry[]>;
  read(filePath: string): Promise<string | null>;
  write(filePath: string, content: string, mode: "append" | "replace"): Promise<void>;
  remove(filePath: string): Promise<void>;
}

const SEED_DIR = path.join(process.cwd(), "data", "knowledge");

function sanitize(filePath: string): string {
  const clean = filePath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!/^[a-zA-Z0-9._\-/]+\.(md|json)$/.test(clean) || clean.includes("..")) {
    throw new Error(
      `Invalid knowledge path "${filePath}" — use a simple name ending in .md (e.g. insights.md)`,
    );
  }
  return clean;
}

/** Paths starting with "_" are app internals (e.g. settings) — hidden from listings. */
function isHidden(filePath: string): boolean {
  return filePath.startsWith("_");
}

function preview(content: string): string {
  return content.replace(/\s+/g, " ").slice(0, 120);
}

/* ------------------------------------------------------------------ */
/* local fs driver                                                      */
/* ------------------------------------------------------------------ */

function localStore(): KnowledgeStore {
  return {
    driver: "local-fs",
    async list() {
      const files = fs
        .readdirSync(SEED_DIR)
        .filter((f) => f.endsWith(".md") && !isHidden(f));
      return files.map((f) => {
        const full = path.join(SEED_DIR, f);
        const stat = fs.statSync(full);
        const content = fs.readFileSync(full, "utf8");
        return {
          path: f,
          bytes: stat.size,
          updated_at: stat.mtime.toISOString(),
          preview: preview(content),
        };
      });
    },
    async read(p) {
      const clean = sanitize(p);
      const full = path.join(SEED_DIR, clean);
      if (!full.startsWith(SEED_DIR)) throw new Error("Path escapes knowledge directory");
      return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    },
    async write(p, content, mode) {
      const clean = sanitize(p);
      const full = path.join(SEED_DIR, clean);
      if (!full.startsWith(SEED_DIR)) throw new Error("Path escapes knowledge directory");
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (mode === "append" && fs.existsSync(full)) {
        const existing = fs.readFileSync(full, "utf8");
        fs.writeFileSync(full, `${existing.replace(/\n*$/, "\n")}${content}\n`, "utf8");
      } else {
        fs.writeFileSync(full, content, "utf8");
      }
    },
    async remove(p) {
      const clean = sanitize(p);
      const full = path.join(SEED_DIR, clean);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    },
  };
}

/* ------------------------------------------------------------------ */
/* memory driver (serverless fallback)                                  */
/* ------------------------------------------------------------------ */

const memoryFiles = new Map<string, { content: string; updated_at: string }>();
let memorySeeded = false;

function seedMemory() {
  if (memorySeeded) return;
  memorySeeded = true;
  try {
    for (const f of fs.readdirSync(SEED_DIR).filter((x) => x.endsWith(".md"))) {
      memoryFiles.set(f, {
        content: fs.readFileSync(path.join(SEED_DIR, f), "utf8"),
        updated_at: new Date().toISOString(),
      });
    }
  } catch {
    /* no seed dir available */
  }
}

function memoryStore(): KnowledgeStore {
  seedMemory();
  return {
    driver: "memory",
    async list() {
      return [...memoryFiles.entries()]
        .filter(([p]) => !isHidden(p))
        .map(([p, v]) => ({
          path: p,
          bytes: Buffer.byteLength(v.content),
          updated_at: v.updated_at,
          preview: preview(v.content),
        }));
    },
    async read(p) {
      return memoryFiles.get(sanitize(p))?.content ?? null;
    },
    async write(p, content, mode) {
      const clean = sanitize(p);
      const existing = memoryFiles.get(clean);
      const next =
        mode === "append" && existing
          ? `${existing.content.replace(/\n*$/, "\n")}${content}\n`
          : content;
      memoryFiles.set(clean, { content: next, updated_at: new Date().toISOString() });
    },
    async remove(p) {
      memoryFiles.delete(sanitize(p));
    },
  };
}

/* ------------------------------------------------------------------ */
/* supabase driver                                                      */
/* ------------------------------------------------------------------ */

async function supabaseStore(): Promise<KnowledgeStore | null> {
  const { getServerSupabaseConfig } = await import("@/lib/server/supabase-key");
  const config = getServerSupabaseConfig();
  if (!config) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(config.url, config.key);

  // probe — if the table doesn't exist, fall back
  const probe = await supabase.from("knowledge_files").select("path").limit(1);
  if (probe.error) return null;

  // make sure baseline files exist
  if ((probe.data ?? []).length === 0) {
    try {
      for (const f of fs.readdirSync(SEED_DIR).filter((x) => x.endsWith(".md"))) {
        await supabase.from("knowledge_files").upsert(
          {
            path: f,
            content: fs.readFileSync(path.join(SEED_DIR, f), "utf8"),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "path" },
        );
      }
    } catch {
      /* best effort */
    }
  }

  return {
    driver: "supabase",
    async list() {
      const { data, error } = await supabase
        .from("knowledge_files")
        .select("path,content,updated_at")
        .order("path");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((r) => !isHidden(r.path))
        .map((r) => ({
          path: r.path,
          bytes: Buffer.byteLength(r.content ?? ""),
          updated_at: r.updated_at,
          preview: preview(r.content ?? ""),
        }));
    },
    async read(p) {
      const { data, error } = await supabase
        .from("knowledge_files")
        .select("content")
        .eq("path", sanitize(p))
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.content ?? null;
    },
    async write(p, content, mode) {
      const clean = sanitize(p);
      let next = content;
      if (mode === "append") {
        const { data } = await supabase
          .from("knowledge_files")
          .select("content")
          .eq("path", clean)
          .maybeSingle();
        if (data?.content) next = `${data.content.replace(/\n*$/, "\n")}${content}\n`;
      }
      const { error } = await supabase
        .from("knowledge_files")
        .upsert(
          { path: clean, content: next, updated_at: new Date().toISOString() },
          { onConflict: "path" },
        );
      if (error) throw new Error(error.message);
    },
    async remove(p) {
      const { error } = await supabase
        .from("knowledge_files")
        .delete()
        .eq("path", sanitize(p));
      if (error) throw new Error(error.message);
    },
  };
}

/* ------------------------------------------------------------------ */
/* resolution                                                           */
/* ------------------------------------------------------------------ */

let resolved: KnowledgeStore | null = null;
let resolving: Promise<KnowledgeStore> | null = null;

export async function getKnowledgeStore(): Promise<KnowledgeStore> {
  if (resolved) return resolved;
  if (!resolving) {
    resolving = (async () => {
      const supa = await supabaseStore().catch(() => null);
      if (supa) {
        resolved = supa;
      } else {
        // local fs works in dev; on read-only serverless filesystems writes
        // throw, so verify writability first
        try {
          fs.accessSync(SEED_DIR, fs.constants.W_OK);
          resolved = localStore();
        } catch {
          resolved = memoryStore();
        }
      }
      return resolved;
    })();
  }
  return resolving;
}
