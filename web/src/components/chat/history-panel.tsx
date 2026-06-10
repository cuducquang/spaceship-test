"use client";

import { useState } from "react";
import {
  Check,
  MessageSquareText,
  PanelLeftClose,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ConversationMeta } from "@/lib/client/conversations";
import { modelShortLabel } from "@/lib/chat-models";
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

  return (
    <aside className="flex h-full w-[252px] shrink-0 flex-col border-r border-border bg-bg-2/50">
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border bg-panel/70 px-3 py-2.5 backdrop-blur">
        <MessageSquareText size={14} className="text-brand" />
        <span className="font-display text-[13.5px] font-bold text-ink">History</span>
        {driver && (
          <span className="tag !py-0 text-[9.5px]" title="Where conversations are stored">
            {driver}
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

      <div className="p-2.5">
        <button onClick={onNew} className="btn-primary w-full justify-center !py-2 text-[13px]">
          <Plus size={14} />
          New conversation
        </button>
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
        {driver === "supabase" && conversations.length === 0 && (
          <p className="px-2 pt-6 text-center text-[11.5px] leading-relaxed text-ink-3">
            No conversations yet — ask the analyst something.
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group relative rounded-xl border border-transparent px-2.5 py-2 transition-colors",
              activeId === c.id
                ? "border-brand-2/40 bg-brand-soft/70"
                : "hover:bg-panel hover:shadow-sm",
            )}
          >
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
              <button onClick={() => onOpen(c.id)} className="block w-full text-left">
                <div className="truncate pr-10 text-[12.5px] font-semibold leading-snug text-ink">
                  {c.title}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-3">
                  <span className="rounded-md bg-panel-2 px-1.5 py-px font-semibold">
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
        ))}
      </div>
    </aside>
  );
}
