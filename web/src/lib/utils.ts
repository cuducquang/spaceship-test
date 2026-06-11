import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ValueFormat = "text" | "number" | "percent" | "currency" | "days";

export function formatValue(
  value: string | number | boolean | null | undefined,
  format: ValueFormat = "number",
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value;
  switch (format) {
    case "percent":
      return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    case "currency":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 1000 ? 0 : 2 })}`;
    case "days":
      return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}d`;
    default:
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

/** Compact axis tick formatting: 1.2K, 3.4M, 45% … */
export function formatTick(value: number, format: ValueFormat = "number"): string {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  const prefix = format === "currency" ? "$" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(value / 1_000).toFixed(1)}K`;
  if (format === "days") return `${value}d`;
  return `${prefix}${Math.round(value * 100) / 100}`;
}

/* chart system: cyan leads, indigo follows, status stays semantic (light bg) */
export const STATUS_COLORS: Record<string, string> = {
  delivered: "#10b981",
  delayed: "#f59e0b",
  in_transit: "#0ea5e9",
  exception: "#ef4444",
  canceled: "#64748b",
};

export const CHART_PALETTE = [
  "#0891b2",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#f97316",
  "#8b5cf6",
  "#0ea5e9",
  "#ec4899",
];

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
