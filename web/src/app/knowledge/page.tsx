"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpenText,
  Check,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { Markdown } from "@/components/chat/markdown";
import { cn, timeAgo } from "@/lib/utils";

interface KFile {
  path: string;
  bytes: number;
  updated_at: string;
  preview: string;
}


export default function KnowledgePage() {
  const [files, setFiles] = useState<KFile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/knowledge");
    const json = await res.json();
    setFiles(json.files ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const open = async (path: string) => {
    setSelected(path);
    setEditing(false);
    setContent("");
    const res = await fetch(`/api/knowledge/${encodeURIComponent(path)}`);
    const json = await res.json();
    setContent(json.content ?? "");
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selected, content: draft, mode: "replace" }),
    });
    setBusy(false);
    setEditing(false);
    setContent(draft);
    void refresh();
  };

  const remove = async (path: string) => {
    if (!confirm(`Delete ${path}? The agent will lose this memory.`)) return;
    await fetch(`/api/knowledge/${encodeURIComponent(path)}`, { method: "DELETE" });
    if (selected === path) {
      setSelected(null);
      setContent("");
    }
    void refresh();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6 pb-16">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display flex items-center gap-2.5 text-[26px] font-bold tracking-tight text-ink">
              <BookOpenText className="text-brand" size={24} />
              Agent knowledge
            </h1>
          </div>
          <button onClick={() => refresh()} className="btn-ghost">
            <RefreshCw size={14} />
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-12 gap-4">
          {/* file list */}
          <div className="col-span-12 space-y-2.5 md:col-span-4">
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => open(f.path)}
                className={cn(
                  "card card-hover group w-full p-3.5 text-left",
                  selected === f.path && "border-brand-2 shadow-[var(--shadow-glow)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={14} className="shrink-0 text-brand" />
                    <span className="truncate font-mono text-[12.5px] font-semibold text-ink">
                      {f.path}
                    </span>
                  </div>
                  <Trash2
                    size={13}
                    className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-bad group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(f.path);
                    }}
                  />
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-3">
                  {f.preview}
                </p>
                <p className="mt-1.5 text-[10.5px] text-ink-3">
                  {f.bytes} B · updated {timeAgo(f.updated_at)}
                </p>
              </button>
            ))}
            {files.length === 0 && (
              <div className="card p-6 text-center text-[12.5px] text-ink-3">Loading…</div>
            )}
          </div>

          {/* viewer / editor */}
          <div className="col-span-12 md:col-span-8">
            {selected ? (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="font-mono text-[13px] font-semibold text-ink">{selected}</span>
                  {editing ? (
                    <div className="flex gap-1.5">
                      <button onClick={save} disabled={busy} className="btn-primary !px-3 !py-1.5 !text-[12px]">
                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save
                      </button>
                      <button onClick={() => setEditing(false)} className="btn-ghost !px-3 !py-1.5 !text-[12px]">
                        <X size={12} />
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setDraft(content);
                        setEditing(true);
                      }}
                      className="btn-ghost !px-3 !py-1.5 !text-[12px]"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                </div>
                <div className="max-h-[68vh] overflow-y-auto p-5">
                  {editing ? (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="h-[56vh] w-full resize-none rounded-xl border border-border bg-panel-2/40 p-4 font-mono text-[12.5px] leading-relaxed text-ink outline-none focus:border-brand-2"
                    />
                  ) : content ? (
                    <Markdown>{content}</Markdown>
                  ) : (
                    <div className="skeleton h-40 w-full" />
                  )}
                </div>
              </div>
            ) : (
              <div className="card flex h-64 flex-col items-center justify-center gap-3 text-ink-3">
                <BookOpenText size={26} />
                <p className="text-[13px]">Select a file to view the agent&apos;s memory</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
