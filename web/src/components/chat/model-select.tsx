"use client";

import { Select } from "@/components/ui/select";
import { CHAT_MODELS } from "@/lib/chat-models";

export function ModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      size="sm"
      className="min-w-[176px]"
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      groups={[
        {
          label: "Anthropic",
          options: CHAT_MODELS.filter((m) => m.provider === "anthropic").map((m) => ({
            value: m.id,
            label: m.label,
            hint: m.hint,
          })),
        },
        {
          label: "Google",
          options: CHAT_MODELS.filter((m) => m.provider === "google").map((m) => ({
            value: m.id,
            label: m.label,
            hint: m.hint,
          })),
        },
      ]}
    />
  );
}
