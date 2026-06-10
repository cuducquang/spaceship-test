"use client";

import { useMemo, useState } from "react";
import {
  Check,
  MessageSquareText,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { ConversationMeta } from "@/lib/client/conversations";
import { getChatModel, modelShortLabel, PROVIDER_COLORS } from "@/lib/chat-models";
import { cn, timeAgo } from "@/lib/utils";

export function HistoryPanel({
  conversations,
  activeId,
  driver,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onClose,
}: {
  conversations: ConversationMeta[];
  activeId: string | null;
  driver: "supabase" | "none" | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      query.trim()
        ? conversations.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
        : conversations,
    [conversations, query],
  );

  return (
    <aside className="flex h-full w-[256px] shrink-0 flex-col border-r border-border bg-bg-2/60">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border bg-panel/75 px-3 py-2.5 backdrop-blur">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan shadow-sm">
          <MessageSquareText size={12} className="text-white" />
        </span>
        <span className="font-display text-[13.5px] font-bold text-ink">History</span>
        {driver && (
          <span
            className={cn(
              "tag !py-0 text-[9.5px]",
              driver === "supabase" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            )}
            title="Where conversations are stored"
          >
            {driver === "supabase" ? "● supabase" : "off"}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          title="Collapse history"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="space-y-2 p-2.5">
        <button onClick={onNew} className="btn-primary w-full justify-center !py-2 text-[13px]">
          <Plus size={14} />
          New conversation
        </button>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-8 w-full rounded-lg border border-border bg-panel pl-7.5 pr-2 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-brand-2"
          />
        </div>
      </div>

      {/* list */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-3">
        {driver === "none" && (
          <p className="mx-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800">
            History is stored in Supabase. Run{" "}
            <code className="font-mono">supabase/migrations</code> 0001 and 0002 in the SQL
            editor to enable persistence.
          </p>
        )}
        {driver === "supabase" && filtered.length === 0 && (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-relaxed text-ink-3">
            {query ? "No conversations match." : "No conversations yet — ask the analyst something."}
          </p>
        )}
        {filtered.map((c) => {
          const provider = getChatModel(c.model).provider;
          const active = activeId === c.id;
          return (
            <div
              key={c.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-transparent px-2.5 py-2 transition-all",
                active
                  ? "border-border bg-panel shadow-sm"
                  : "hover:bg-panel/70 hover:shadow-sm",
              )}
            >
              {active && (
                <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r bg-gradient-to-b from-brand-2 to-cyan" />
              )}
              {editing === c.id ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && draft.trim()) {
                        onRename(c.id, draft.trim());
                        setEditing(null);
                      }
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-lg border border-brand-2 bg-panel px-2 text-[12px] text-ink outline-none"
                  />
                  <button
                    onClick={() => {
                      if (draft.trim()) onRename(c.id, draft.trim());
                      setEditing(null);
                    }}
                    className="text-good"
                  >
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditing(null)} className="text-ink-3">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => onOpen(c.id)} className="block w-full pl-1 text-left">
                  <div className="truncate pr-10 text-[12.5px] font-semibold leading-snug text-ink">
                    {c.title}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-3">
                    <span className="flex items-center gap-1 rounded-md bg-panel-2 px-1.5 py-px font-semibold">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: PROVIDER_COLORS[provider] }}
                      />
                      {modelShortLabel(c.model)}
                    </span>
                    {timeAgo(c.updated_at)}
                    {c.summary && (
                      <span className="text-violet" title="Has a compacted summary">
                        · compacted
                      </span>
                    )}
                  </div>
                </button>
              )}

              {editing !== c.id && (
                <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.title);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-panel text-ink-3 shadow-sm hover:text-ink"
                    title="Rename"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-panel text-ink-3 shadow-sm hover:text-bad"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
