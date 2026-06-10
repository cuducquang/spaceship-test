"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  hint?: string;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

function Item({ option }: { option: SelectOption }) {
  return (
    <SelectPrimitive.Item
      value={option.value}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-3 pr-8 text-[13px] text-ink outline-none transition-colors",
        "data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand",
        "data-[state=checked]:font-semibold",
      )}
    >
      <div className="min-w-0">
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.hint && (
          <div className="truncate text-[10.5px] font-normal text-ink-3">{option.hint}</div>
        )}
      </div>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5">
        <Check size={13} className="text-brand" strokeWidth={3} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function Select({
  value,
  onValueChange,
  options,
  groups,
  placeholder = "Select…",
  disabled,
  className,
  size = "md",
}: {
  value: string;
  onValueChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          "group flex items-center justify-between gap-2 rounded-xl border border-border bg-panel text-left font-medium text-ink shadow-sm outline-none transition-all",
          "hover:border-brand-2 focus-visible:border-brand-2 focus-visible:ring-4 focus-visible:ring-brand-2/15",
          "data-[state=open]:border-brand-2 data-[state=open]:ring-4 data-[state=open]:ring-brand-2/15",
          "disabled:cursor-not-allowed disabled:opacity-55",
          size === "md" ? "h-10 px-3.5 text-[13px]" : "h-8.5 px-3 text-[12.5px]",
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown
            size={14}
            className="shrink-0 text-ink-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-panel shadow-[var(--shadow-lift)]",
            "data-[state=open]:animate-[blockEnter_0.18s_ease]",
          )}
        >
          <SelectPrimitive.Viewport className="max-h-80 overflow-y-auto p-1.5">
            {options?.map((o) => <Item key={o.value} option={o} />)}
            {groups?.map((g, i) => (
              <SelectPrimitive.Group key={g.label}>
                {i > 0 && <SelectPrimitive.Separator className="mx-2 my-1 h-px bg-border" />}
                <SelectPrimitive.Label className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                  {g.label}
                </SelectPrimitive.Label>
                {g.options.map((o) => (
                  <Item key={o.value} option={o} />
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
