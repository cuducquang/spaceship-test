"use client";

import type { AgentEvent } from "@/lib/agent/events";

export interface StreamHandle {
  abort: () => void;
  finished: Promise<void>;
}

/** POST to /api/chat and dispatch parsed SSE events. */
export function streamChat(
  body: {
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    model?: string;
    summary?: string;
  },
  onEvent: (event: AgentEvent) => void,
): StreamHandle {
  const controller = new AbortController();

  const finished = (async () => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      let message = `Request failed (${res.status})`;
      try {
        message = JSON.parse(text).error ?? message;
      } catch {
        /* keep default */
      }
      onEvent({ type: "error", message });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  })().catch((err) => {
    if ((err as Error).name !== "AbortError") {
      onEvent({ type: "error", message: (err as Error).message });
    }
  });

  return { abort: () => controller.abort(), finished };
}
