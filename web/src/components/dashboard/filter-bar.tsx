"use client";

import { X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { QueryFilters } from "@/lib/analytics/specs";

export interface DashboardFilters {
  period: "all" | "3m" | "6m" | "h1" | "h2";
  region: string;
  carrier: string;
  status: string;
  category: string;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  period: "all",
  region: "",
  carrier: "",
  status: "",
  category: "",
};

export const PERIOD_LABELS: Record<DashboardFilters["period"], string> = {
  all: "Full year 2025",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  h1: "H1 2025 (Jan–Jun)",
  h2: "H2 2025 (Jul–Dec)",
};

const ALL = "__all__";

export function toQueryFilters(f: DashboardFilters): QueryFilters {
  const filters: QueryFilters = {};
  if (f.period === "3m") filters.relative_window = { unit: "month", n: 3 };
  if (f.period === "6m") filters.relative_window = { unit: "month", n: 6 };
  if (f.period === "h1") {
    filters.date_from = "2025-01-01";
    filters.date_to = "2025-06-30";
  }
  if (f.period === "h2") {
    filters.date_from = "2025-07-01";
    filters.date_to = "2025-12-31";
  }
  if (f.region) filters.regions = [f.region];
  if (f.carrier) filters.carriers = [f.carrier];
  if (f.status) filters.statuses = [f.status as NonNullable<QueryFilters["statuses"]>[number]];
  if (f.category) filters.product_categories = [f.category];
  return filters;
}

export function describeFilters(f: DashboardFilters): string {
  const parts = [PERIOD_LABELS[f.period]];
  if (f.region) parts.push(`region ${f.region}`);
  if (f.carrier) parts.push(`carrier ${f.carrier}`);
  if (f.status) parts.push(`status ${f.status}`);
  if (f.category) parts.push(`category ${f.category}`);
  return parts.join(", ");
}

function FacetSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <Select
      size="sm"
      className="min-w-[132px]"
      value={value === "" ? ALL : value}
      onValueChange={(v) => onChange(v === ALL ? "" : v)}
      options={[
        { value: ALL, label: placeholder },
        ...options.map((o) => ({ value: o, label: o })),
      ]}
    />
  );
}

export function FilterBar({
  filters,
  onChange,
  meta,
}: {
  filters: DashboardFilters;
  onChange: (f: DashboardFilters) => void;
  meta: {
    regions: string[];
    carriers: string[];
    categories: string[];
  } | null;
}) {
  const active: { key: keyof DashboardFilters; label: string }[] = [];
  if (filters.region) active.push({ key: "region", label: `Region: ${filters.region}` });
  if (filters.carrier) active.push({ key: "carrier", label: `Carrier: ${filters.carrier}` });
  if (filters.status) active.push({ key: "status", label: `Status: ${filters.status}` });
  if (filters.category) active.push({ key: "category", label: `Category: ${filters.category}` });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        size="sm"
        className="min-w-[150px] font-semibold"
        value={filters.period}
        onValueChange={(v) => onChange({ ...filters, period: v as DashboardFilters["period"] })}
        options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <FacetSelect
        value={filters.region}
        onChange={(v) => onChange({ ...filters, region: v })}
        options={meta?.regions ?? []}
        placeholder="All regions"
      />
      <FacetSelect
        value={filters.carrier}
        onChange={(v) => onChange({ ...filters, carrier: v })}
        options={meta?.carriers ?? []}
        placeholder="All carriers"
      />
      <FacetSelect
        value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v })}
        options={["delivered", "delayed", "in_transit", "exception", "canceled"]}
        placeholder="All statuses"
      />
      <FacetSelect
        value={filters.category}
        onChange={(v) => onChange({ ...filters, category: v })}
        options={meta?.categories ?? []}
        placeholder="All categories"
      />

      {active.map((chip) => (
        <button
          key={chip.key}
          onClick={() => onChange({ ...filters, [chip.key]: "" })}
          className="tag border-brand-2/40 bg-brand-soft text-brand transition-colors hover:border-bad hover:bg-rose-50 hover:text-bad"
        >
          {chip.label}
          <X size={11} />
        </button>
      ))}
    </div>
  );
}
