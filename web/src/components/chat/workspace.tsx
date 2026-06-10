"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  ChevronRight,
  CircleStop,
  Clock3,
  Image as ImageIcon,
  PackageSearch,
  PanelLeftOpen,
  PanelRightOpen,
  Plus,
  Rocket,
  Sparkles,
  TrendingUp,
  Truck,
  Workflow,
  Zap,
} from "lucide-react";
import type { AgentEvent, ToolUiPayload } from "@/lib/agent/events";
import { DEFAULT_CHAT_MODEL } from "@/lib/chat-models";
import { streamChat, type StreamHandle } from "@/lib/client/chat-stream";
import {
  getConversationsStore,
  type AppendableMessage,
  type ConversationMeta,
  type ConversationsStore,
  type StoredMessage,
  type StoredSegment,
} from "@/lib/client/conversations";
import { cn } from "@/lib/utils";
import { ThinkingSection, ToolStep, type ToolStepData } from "./agent-step";
import {
  CanvasContext,
  canvasKindOf,
  canvasTitleOf,
  type CanvasItem,
} from "./canvas-context";
import { CanvasPanel } from "./canvas-panel";
import { COMPACT_AT, ContextBar } from "./context-bar";
import { HistoryPanel } from "./history-panel";
import { Markdown } from "./markdown";
import { ModelSelect } from "./model-select";

/* ------------------------------------------------------------------ */
/* message model                                                        */
/* ------------------------------------------------------------------ */

type Segment =
  | { kind: "thinking"; text: string; done: boolean }
  | { kind: "text"; text: string }
  | { kind: "tool"; step: ToolStepData };

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  segments: Segment[];
  status: "streaming" | "done" | "error";
  usage?: { input_tokens: number; output_tokens: number; iterations: number };
}

function assistantText(item: ChatItem): string {
  return item.segments
    .filter((s): s is Extract<Segment, { kind: "text" }> => s.kind === "text")
    .map((s) => s.text)
    .join("")
    .trim();
}

function toStoredSegments(segments: Segment[]): StoredSegment[] {
  return segments.map((s): StoredSegment => {
    if (s.kind === "thinking") return { kind: "thinking", text: s.text };
    if (s.kind === "text") return { kind: "text", text: s.text };
    return {
      kind: "tool",
      toolName: s.step.name,
      toolStatus: s.step.status === "error" ? "error" : "done",
      toolSummary: s.step.summary,
      toolInput: s.step.input,
      toolError: s.step.error,
      payload: s.step.payload,
    };
  });
}

function fromStoredSegments(stored: StoredSegment[], msgIdx: number): Segment[] {
  return stored.map((s, i): Segment => {
    if (s.kind === "thinking") return { kind: "thinking", text: s.text ?? "", done: true };
    if (s.kind === "text") return { kind: "text", text: s.text ?? "" };
    return {
      kind: "tool",
      step: {
        id: `replay_${msgIdx}_${i}`,
        name: s.toolName ?? "tool",
        status: s.toolStatus ?? "done",
        input: s.toolInput,
        summary: s.toolSummary,
        error: s.toolError,
        payload: s.payload,
      },
    };
  });
}

type SegmentBlock =
  | { kind: "text"; text: string }
  | { kind: "pipeline"; items: Extract<Segment, { kind: "thinking" | "tool" }>[] };

/** Group consecutive thinking/tool segments so they render as one connected pipeline. */
function groupSegments(segments: Segment[]): SegmentBlock[] {
  const blocks: SegmentBlock[] = [];
  for (const seg of segments) {
    if (seg.kind === "text") {
      blocks.push({ kind: "text", text: seg.text });
    } else {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "pipeline") last.items.push(seg);
      else blocks.push({ kind: "pipeline", items: [seg] });
    }
  }
  return blocks;
}

function UsageChip({ icon: Icon, text }: { icon: typeof Workflow; text: string }) {
  return (
    <span className="flex items-center gap-1 rounded-md border border-border bg-panel-2/70 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
      <Icon size={10} />
      {text}
    </span>
  );
}

interface Meta {
  id: string | null;
  title: string;
  model: string;
  summary: string | null;
  compactedUntil: number;
  totalIn: number;
  totalOut: number;
  lastContext: number;
}

const EMPTY_META: Meta = {
  id: null,
  title: "New conversation",
  model: DEFAULT_CHAT_MODEL,
  summary: null,
  compactedUntil: 0,
  totalIn: 0,
  totalOut: 0,
  lastContext: 0,
};

const SUGGESTIONS = [
  { icon: Clock3, title: "Delayed orders trend", q: "Show delayed orders by week for the last 3 months" },
  { icon: Truck, title: "Carrier delay rates", q: "Which carrier has the highest delay rate? Account for sample size." },
  { icon: PackageSearch, title: "Late deliveries last month", q: "How many orders were delivered late last month?" },
  { icon: TrendingUp, title: "Demand forecast", q: "Predict demand for the CRAYON category for the next 4 months. How much inventory should I plan?" },
  { icon: Sparkles, title: "Regional deep-dive", q: "Compare on-time delivery rate across regions and visualize it. Which region needs attention?" },
  { icon: ImageIcon, title: "Report cover image", q: "Generate a clean, modern cover illustration for our 2025 logistics performance report." },
];

/* ------------------------------------------------------------------ */

export function ChatWorkspace({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [store, setStore] = useState<ConversationsStore | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [compacting, setCompacting] = useState(false);

  const handleRef = useRef<StreamHandle | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<ChatItem[]>([]);
  itemsRef.current = items;
  const metaRef = useRef<Meta>(meta);
  metaRef.current = meta;
  const bootstrapped = useRef(false);

  /* ----- store + conversation list ----- */
  const refreshList = useCallback(async (s?: ConversationsStore) => {
    const st = s ?? (await getConversationsStore());
    setConversations(await st.list().catch(() => []));
  }, []);

  useEffect(() => {
    getConversationsStore().then((s) => {
      setStore(s);
      void refreshList(s);
    });
  }, [refreshList]);

  /* ----- canvas helpers ----- */
  const pushCanvas = useCallback((key: string, payload: ToolUiPayload) => {
    const kind = canvasKindOf(payload);
    if (!kind) return;
    setCanvasItems((prev) =>
      prev.some((c) => c.key === key)
        ? prev
        : [...prev, { key, kind, title: canvasTitleOf(payload), payload, ts: Date.now() }],
    );
  }, []);

  const canvasApi = useMemo(
    () => ({
      focus(key: string) {
        setCanvasOpen(true);
        setFocusedKey(key);
        setTimeout(() => setFocusedKey((k) => (k === key ? null : k)), 1800);
      },
      has(key: string) {
        return canvasItems.some((c) => c.key === key);
      },
    }),
    [canvasItems],
  );

  /* ----- load a conversation ----- */
  const loadConversation = useCallback(
    async (id: string, s?: ConversationsStore) => {
      const st = s ?? (await getConversationsStore());
      const data = await st.get(id);
      if (!data) return false;
      setMeta({
        id: data.id,
        title: data.title,
        model: data.model,
        summary: data.summary,
        compactedUntil: data.compacted_until,
        totalIn: data.total_input_tokens,
        totalOut: data.total_output_tokens,
        lastContext: data.last_context_tokens,
      });
      const loaded: ChatItem[] = data.messages.map((m, i) => ({
        id: `r_${i}`,
        role: m.role,
        text: m.role === "user" ? m.content : "",
        segments: m.role === "assistant" ? fromStoredSegments(m.segments ?? [], i) : [],
        status: "done" as const,
        usage: m.usage,
      }));
      setItems(loaded);
      const canvas: CanvasItem[] = [];
      loaded.forEach((item) =>
        item.segments.forEach((seg) => {
          if (seg.kind === "tool" && seg.step.payload) {
            const kind = canvasKindOf(seg.step.payload);
            if (kind) {
              canvas.push({
                key: seg.step.id,
                kind,
                title: canvasTitleOf(seg.step.payload),
                payload: seg.step.payload,
                ts: Date.now(),
              });
            }
          }
        }),
      );
      setCanvasItems(canvas);
      return true;
    },
    [],
  );

  /* ----- event reducer (ported from v1, plus usage capture) ----- */
  const applyEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === "tool_result" && event.payload) pushCanvas(event.id, event.payload);
      setItems((prev) => {
        const next = [...prev];
        const lastIndex = next.length - 1;
        const last = next[lastIndex];
        if (!last || last.role !== "assistant") return prev;
        const segments = [...last.segments];
        const tail = segments[segments.length - 1];

        switch (event.type) {
          case "text_delta": {
            if (tail?.kind === "text") {
              segments[segments.length - 1] = { kind: "text", text: tail.text + event.text };
            } else {
              segments.push({ kind: "text", text: event.text });
            }
            break;
          }
          case "thinking_delta": {
            if (tail?.kind === "thinking" && !tail.done) {
              segments[segments.length - 1] = {
                kind: "thinking",
                text: tail.text + event.text,
                done: false,
              };
            } else {
              segments.push({ kind: "thinking", text: event.text, done: false });
            }
            break;
          }
          case "thinking_done": {
            if (tail?.kind === "thinking") segments[segments.length - 1] = { ...tail, done: true };
            break;
          }
          case "tool_start": {
            if (!segments.some((s) => s.kind === "tool" && s.step.id === event.id)) {
              segments.push({
                kind: "tool",
                step: { id: event.id, name: event.name, status: "running" },
              });
            }
            break;
          }
          case "tool_result": {
            const idx = segments.findIndex((s) => s.kind === "tool" && s.step.id === event.id);
            const step: ToolStepData = {
              id: event.id,
              name: event.name,
              status: event.ok ? "done" : "error",
              input: event.input,
              summary: event.summary,
              error: event.error,
              payload: event.payload,
            };
            if (idx >= 0) segments[idx] = { kind: "tool", step };
            else segments.push({ kind: "tool", step });
            break;
          }
          case "error": {
            segments.push({ kind: "text", text: `\n\n⚠️ ${event.message}` });
            next[lastIndex] = { ...last, segments, status: "error" };
            return next;
          }
          case "done": {
            next[lastIndex] = { ...last, segments, status: "done", usage: event.usage };
            return next;
          }
          default:
            return prev;
        }
        next[lastIndex] = { ...last, segments };
        return next;
      });

      if (event.type === "done") {
        setMeta((m) => ({
          ...m,
          totalIn: m.totalIn + event.usage.input_tokens,
          totalOut: m.totalOut + event.usage.output_tokens,
          lastContext: event.usage.context_tokens,
        }));
      }
    },
    [pushCanvas],
  );

  /* ----- compaction ----- */
  const runCompact = useCallback(async (): Promise<void> => {
    const m = metaRef.current;
    const current = itemsRef.current;
    if (!m.id || !store) return;
    const turns = current
      .slice(m.compactedUntil)
      .map((i) => ({ role: i.role, content: i.role === "user" ? i.text : assistantText(i) }))
      .filter((t) => t.content.length > 0);
    if (turns.length < 4) return;
    setCompacting(true);
    try {
      const res = await fetch("/api/compact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns, prior_summary: m.summary ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Compaction failed");
      const estContext = 7000 + Math.round(json.summary.length / 4);
      await store.update(m.id, {
        summary: json.summary,
        compacted_until: current.length,
        last_context_tokens: estContext,
      });
      setMeta((prev) => ({
        ...prev,
        summary: json.summary,
        compactedUntil: current.length,
        lastContext: estContext,
      }));
    } finally {
      setCompacting(false);
    }
  }, [store]);

  /* ----- send ----- */
  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || handleRef.current || !store) return;

      // auto-compact when the context bar is full
      if (
        metaRef.current.lastContext >= COMPACT_AT &&
        itemsRef.current.length - metaRef.current.compactedUntil >= 4
      ) {
        await runCompact().catch(() => null);
      }

      let m = metaRef.current;

      // first message → create the conversation and move to /chat/{id}
      if (!m.id) {
        const created = await store
          .create({ title: text.slice(0, 70), model: m.model })
          .catch(() => null);
        if (created) {
          m = { ...m, id: created.id, title: created.title };
          setMeta((prev) => ({ ...prev, id: created.id, title: created.title }));
          window.history.replaceState(null, "", `/chat/${created.id}`);
          void refreshList(store);
        }
      }

      const baseCount = itemsRef.current.length;
      const history = itemsRef.current
        .slice(m.compactedUntil)
        .filter((i) => i.status !== "error")
        .map((i) => ({
          role: i.role,
          content: i.role === "user" ? i.text : assistantText(i),
        }))
        .filter((t) => t.content.length > 0)
        .slice(-40);

      setItems((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: "user", text, segments: [], status: "done" },
        { id: `a_${Date.now()}`, role: "assistant", text: "", segments: [], status: "streaming" },
      ]);
      setDraft("");
      setStreaming(true);

      const handle = streamChat(
        { message: text, history, model: m.model, summary: m.summary ?? undefined },
        applyEvent,
      );
      handleRef.current = handle;
      handle.finished.finally(async () => {
        handleRef.current = null;
        setStreaming(false);
        setItems((prev) =>
          prev.map((item, i) =>
            i === prev.length - 1 && item.status === "streaming"
              ? { ...item, status: "done" as const }
              : item,
          ),
        );
        // persist the turn
        setTimeout(async () => {
          const mm = metaRef.current;
          if (!mm.id) return;
          const all = itemsRef.current;
          const userItem = all[baseCount];
          const assistantItem = all[baseCount + 1];
          if (!userItem || !assistantItem) return;
          const batch: AppendableMessage[] = [
            { idx: baseCount, role: "user", content: userItem.text },
            {
              idx: baseCount + 1,
              role: "assistant",
              content: assistantText(assistantItem),
              segments: toStoredSegments(assistantItem.segments),
              usage: assistantItem.usage,
            },
          ];
          await store.appendMessages(mm.id, batch).catch(() => null);
          await store
            .update(mm.id, {
              model: mm.model,
              total_input_tokens: mm.totalIn,
              total_output_tokens: mm.totalOut,
              last_context_tokens: mm.lastContext,
            })
            .catch(() => null);
          void refreshList(store);
        }, 60);
      });
    },
    [store, applyEvent, refreshList, runCompact],
  );

  const stop = useCallback(() => handleRef.current?.abort(), []);

  /* ----- bootstrap: /chat/[id] or ?q= ----- */
  useEffect(() => {
    if (bootstrapped.current || !store) return;
    bootstrapped.current = true;
    (async () => {
      if (conversationId) {
        const ok = await loadConversation(conversationId, store);
        if (!ok) router.replace("/chat");
        return;
      }
      const q = params.get("q");
      if (q) {
        router.replace("/chat");
        setTimeout(() => void send(q), 80);
      }
    })();
  }, [store, conversationId, loadConversation, params, router, send]);

  /* ----- auto scroll ----- */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  /* ----- panel actions ----- */
  const newConversation = () => {
    stop();
    setMeta(EMPTY_META);
    setItems([]);
    setCanvasItems([]);
    window.history.replaceState(null, "", "/chat");
  };

  const openConversation = async (id: string) => {
    if (id === meta.id) return;
    stop();
    const ok = await loadConversation(id);
    if (ok) window.history.replaceState(null, "", `/chat/${id}`);
  };

  const renameConversation = async (id: string, title: string) => {
    if (!store) return;
    await store.update(id, { title }).catch(() => null);
    if (meta.id === id) setMeta((m) => ({ ...m, title }));
    void refreshList(store);
  };

  const deleteConversation = async (id: string) => {
    if (!store) return;
    if (!confirm("Delete this conversation?")) return;
    await store.remove(id).catch(() => null);
    if (meta.id === id) newConversation();
    void refreshList(store);
  };

  const changeModel = async (model: string) => {
    setMeta((m) => ({ ...m, model }));
    if (meta.id && store) await store.update(meta.id, { model }).catch(() => null);
  };

  const uncompacted = items.length - meta.compactedUntil;

  return (
    <CanvasContext.Provider value={canvasApi}>
      <div className="flex h-full min-h-0">
        {historyOpen && (
          <HistoryPanel
            conversations={conversations}
            activeId={meta.id}
            driver={store?.driver ?? null}
            onOpen={openConversation}
            onNew={newConversation}
            onRename={renameConversation}
            onDelete={deleteConversation}
            onClose={() => setHistoryOpen(false)}
          />
        )}

        {/* center column */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="aurora" aria-hidden />
          {/* toolbar */}
          <div className="flex items-center gap-2.5 border-b border-border bg-panel/75 px-3.5 py-2 backdrop-blur-md">
            {!historyOpen && (
              <button
                onClick={() => setHistoryOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
                title="Show history"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full transition-colors",
                streaming
                  ? "pulse-dot bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                  : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]",
              )}
            />
            <div className="min-w-0">
              <div className="truncate font-display text-[13.5px] font-bold text-ink">
                {meta.title}
              </div>
              <div className="text-[10px] text-ink-3">
                {streaming
                  ? "agent running — interpreting, selecting tools, computing"
                  : `${meta.summary ? "compacted session · " : ""}every number computed by validated tools`}
              </div>
            </div>
            <div className="flex-1" />
            <ModelSelect value={meta.model} onChange={changeModel} disabled={streaming} />
            <ContextBar
              lastContextTokens={meta.lastContext}
              totalIn={meta.totalIn}
              totalOut={meta.totalOut}
              canCompact={uncompacted >= 4 && !streaming}
              compacting={compacting}
              onCompact={() => void runCompact()}
            />
            {!canvasOpen && (
              <button
                onClick={() => setCanvasOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
                title="Show canvas"
              >
                <PanelRightOpen size={16} />
              </button>
            )}
            {!historyOpen && (
              <button onClick={newConversation} className="btn-ghost !px-2.5 !py-1.5 !text-[12px]" title="New conversation">
                <Plus size={13} />
              </button>
            )}
          </div>

          {/* messages */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[820px] px-5 py-5">
              {items.length === 0 ? (
                <EmptyState onPick={(q) => void send(q)} />
              ) : (
                items.map((item, idx) => (
                  <div key={item.id}>
                    {idx === meta.compactedUntil && meta.compactedUntil > 0 && (
                      <CompactedDivider summary={meta.summary} />
                    )}
                    {item.role === "user" ? (
                      <div className="fade-up mb-4 flex justify-end">
                        <div className="max-w-[78%] rounded-2xl rounded-br-md bg-gradient-to-br from-navy to-navy-2 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-md">
                          {item.text}
                        </div>
                      </div>
                    ) : (
                      <div className="fade-up mb-7">
                        <div className="mb-2.5 flex items-center gap-2.5">
                          <div
                            className={cn(
                              "relative flex h-7 w-7 items-center justify-center rounded-[10px] bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-md shadow-emerald-500/25",
                              item.status === "streaming" && "avatar-live",
                            )}
                          >
                            <Rocket size={13} className="text-navy" />
                          </div>
                          <div className="leading-none">
                            <span className="text-[11.5px] font-bold uppercase tracking-wider text-ink-2">
                              Atlas
                            </span>
                            {item.status === "streaming" ? (
                              <div className="shimmer-text mt-0.5 text-[10px] font-semibold">
                                interpreting → selecting tools → computing
                              </div>
                            ) : (
                              <div className="mt-0.5 text-[10px] text-ink-3">AI analyst</div>
                            )}
                          </div>
                        </div>
                        <div className="pl-9">
                          {groupSegments(item.segments).map((block, bi) =>
                            block.kind === "text" ? (
                              <Markdown key={bi}>{block.text}</Markdown>
                            ) : (
                              <div key={bi} className="my-2.5">
                                {block.items.map((seg, si) =>
                                  seg.kind === "thinking" ? (
                                    <ThinkingSection key={si} text={seg.text} done={seg.done} />
                                  ) : (
                                    <ToolStep key={seg.step.id} step={seg.step} />
                                  ),
                                )}
                              </div>
                            ),
                          )}
                          {item.usage && item.status === "done" && (
                            <div className="mt-2 flex justify-end gap-1.5">
                              <UsageChip
                                icon={ArrowDownToLine}
                                text={`${(item.usage.input_tokens / 1000).toFixed(1)}k in`}
                              />
                              <UsageChip
                                icon={ArrowUpFromLine}
                                text={`${(item.usage.output_tokens / 1000).toFixed(1)}k out`}
                              />
                              <UsageChip
                                icon={Workflow}
                                text={`${item.usage.iterations} ${item.usage.iterations === 1 ? "step" : "steps"}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              {items.length > 0 && meta.compactedUntil === items.length && (
                <CompactedDivider summary={meta.summary} />
              )}
            </div>
          </div>

          {/* composer */}
          <div className="border-t border-border bg-bg/80 px-5 py-3.5 backdrop-blur">
            <div className="mx-auto max-w-[820px]">
              <div
                className={cn(
                  "composer flex items-end gap-2 p-2 pl-4",
                  streaming && "composer-busy conic-border",
                )}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={1}
                  placeholder='Ask anything — "Which carrier has the highest delay rate?"'
                  className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[14px] text-ink outline-none placeholder:text-ink-3"
                  style={{ height: "auto" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                  }}
                />
                {streaming ? (
                  <button
                    onClick={stop}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-bad transition-colors hover:bg-rose-100"
                    title="Stop"
                  >
                    <CircleStop size={18} />
                  </button>
                ) : (
                  <button
                    onClick={() => void send(draft)}
                    disabled={!draft.trim()}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-cyan text-white shadow-md shadow-brand/25 transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                    title="Send"
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-center text-[10.5px] text-ink-3">
                Relative dates anchor to 2025-12-30 (latest data) · context auto-compacts at{" "}
                {COMPACT_AT / 1000}k tokens
              </p>
            </div>
          </div>
        </div>

        {canvasOpen && (
          <CanvasPanel
            items={canvasItems}
            focusedKey={focusedKey}
            onClose={() => setCanvasOpen(false)}
          />
        )}
      </div>
    </CanvasContext.Provider>
  );
}

function CompactedDivider({ summary }: { summary: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-5 mt-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 text-[10.5px] font-semibold text-violet"
      >
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-violet/40" />
        <Zap size={11} />
        earlier turns compacted into summary {open ? "▴" : "▾"}
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-violet/40" />
      </button>
      {open && summary && (
        <div className="mt-2 rounded-xl border border-violet/25 bg-violet/5 px-3.5 py-2.5 [&_.prose-chat]:text-[12px]">
          <Markdown>{summary}</Markdown>
        </div>
      )}
    </div>
  );
}

const SUGGESTION_GRADS = [
  "from-emerald-400 to-teal-500",
  "from-cyan-400 to-sky-500",
  "from-violet-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-blue-400 to-indigo-500",
];

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      {/* orbiting agent mark */}
      <div className="relative mb-8 h-24 w-24">
        <span className="orbit-ring">
          <span className="orbit-dot bg-brand-2" />
        </span>
        <span className="orbit-ring-2">
          <span
            className="orbit-dot"
            style={{ background: "#6d5dd3", boxShadow: "0 0 10px 2px rgba(109,93,211,0.45)" }}
          />
        </span>
        <div className="absolute inset-[15px] flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-[0_10px_36px_rgba(20,184,166,0.4)]">
          <Rocket size={26} className="text-navy" />
        </div>
      </div>

      <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink">
        Ask your <span className="gradient-text">logistics data</span> anything
      </h2>
      <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-ink-3">
        Pick a model, ask in plain language — the agent interprets, selects validated
        analytical tools, computes, and sends every visualization to the live canvas.
      </p>

      <div className="mt-3 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
        <span className="rounded-full bg-panel-2 px-2 py-0.5">interpret</span>
        <ChevronRight size={10} />
        <span className="rounded-full bg-panel-2 px-2 py-0.5">route to tools</span>
        <ChevronRight size={10} />
        <span className="rounded-full bg-panel-2 px-2 py-0.5">compute</span>
        <ChevronRight size={10} />
        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">explain</span>
      </div>

      <div className="stagger mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            onClick={() => onPick(s.q)}
            className="card group relative flex items-start gap-3 overflow-hidden p-3.5 pr-8 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-2/50 hover:shadow-[var(--shadow-lift)]"
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md",
                SUGGESTION_GRADS[i % SUGGESTION_GRADS.length],
              )}
            >
              <s.icon size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">{s.title}</div>
              <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-ink-3">
                {s.q}
              </div>
            </div>
            <ChevronRight
              size={15}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
