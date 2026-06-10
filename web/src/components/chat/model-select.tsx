"use client";

import { Select } from "@/components/ui/select";
import { CHAT_MODELS, PROVIDER_COLORS, type ChatProvider } from "@/lib/chat-models";

function Dot({ provider }: { provider: ChatProvider }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: PROVIDER_COLORS[provider], boxShadow: `0 0 6px ${PROVIDER_COLORS[provider]}66` }}
    />
  );
}

export function ModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  const group = (provider: ChatProvider) =>
    CHAT_MODELS.filter((m) => m.provider === provider).map((m) => ({
      value: m.id,
      label: (
        <span className="flex items-center gap-2">
          <Dot provider={m.provider} />
          {m.label}
        </span>
      ),
      hint: m.hint,
    }));

  return (
    <Select
      size="sm"
      className="min-w-[180px]"
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      groups={[
        { label: "Anthropic", options: group("anthropic") },
        { label: "Google", options: group("google") },
      ]}
    />
  );
}
