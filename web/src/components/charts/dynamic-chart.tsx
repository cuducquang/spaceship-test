"use client";

import { useId, useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPayloadData } from "@/lib/agent/events";
import { CHART_PALETTE, STATUS_COLORS, formatTick, formatValue, type ValueFormat } from "@/lib/utils";

/* ------------------------------------------------------------------ */

function shortLabel(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(value.slice(5, 7)) - 1]} ${value.slice(2, 4)}`;
  }
  if (/^\d{4}-W\d{2}$/.test(value)) return value.slice(5);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(5);
  return value;
}

interface TooltipEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

function GlassTooltip({
  active,
  payload,
  label,
  format,
  labelMap,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  format: ValueFormat;
  labelMap: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass rounded-xl px-3.5 py-2.5 shadow-lg">
      {label !== undefined && (
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink-3">
          {String(label)}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-5 text-[12.5px]">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: entry.color }}
              />
              {labelMap[String(entry.dataKey ?? entry.name)] ?? String(entry.name)}
            </span>
            <span className="font-mono font-semibold text-ink">
              {typeof entry.value === "number" ? formatValue(entry.value, format) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DynamicChart({
  chart,
  height = 300,
}: {
  chart: ChartPayloadData;
  height?: number;
}) {
  const gradientId = useId().replace(/[:]/g, "");
  const format: ValueFormat = chart.value_format ?? "number";
  const labelMap = useMemo(
    () => Object.fromEntries(chart.columns.map((c) => [c.key, c.label])),
    [chart.columns],
  );

  const seriesColor = (key: string, index: number) =>
    STATUS_COLORS[key] ??
    STATUS_COLORS[key.replace(/_count$|_rate$/, "")] ??
    CHART_PALETTE[index % CHART_PALETTE.length];

  const data = chart.rows;

  /* ---------- donut ---------- */
  if (chart.type === "donut") {
    const valueKey = chart.series[0];
    const slices = data
      .map((r) => ({ name: String(r[chart.x] ?? "—"), value: Number(r[valueKey] ?? 0) }))
      .filter((s) => s.value > 0);
    const total = slices.reduce((a, s) => a + s.value, 0);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip content={<GlassTooltip format={format} labelMap={labelMap} />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span className="text-xs text-ink-2">{String(v)}</span>}
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2.5}
            cornerRadius={5}
            strokeWidth={0}
          >
            {slices.map((s, i) => (
              <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Pie>
          <text
            x="50%"
            y="46%"
            textAnchor="middle"
            className="fill-[var(--ink)] font-display"
            style={{ fontSize: 22, fontWeight: 700 }}
          >
            {formatValue(total, format)}
          </text>
          <text x="50%" y="54%" textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-3)" }}>
            total
          </text>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  /* ---------- horizontal bar ---------- */
  if (chart.type === "horizontal_bar") {
    const h = Math.max(height, data.length * 34 + 60);
    return (
      <ResponsiveContainer width="100%" height={h}>
        <ComposedChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            type="number"
            tickFormatter={(v) => formatTick(Number(v), format)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey={chart.x}
            width={118}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11.5 }}
          />
          <Tooltip
            content={<GlassTooltip format={format} labelMap={labelMap} />}
            cursor={{ fill: "rgba(99,102,241,0.08)" }}
          />
          {chart.series.length > 1 && (
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => (
                <span className="text-xs text-ink-2">{labelMap[String(v)] ?? String(v)}</span>
              )}
            />
          )}
          {chart.series.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={seriesColor(key, i)}
              radius={[0, 6, 6, 0]}
              maxBarSize={22}
              animationDuration={700}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  /* ---------- cartesian (line / area / bar / stacked / combo) ---------- */
  const lineKeys = chart.type === "combo" ? (chart.line_series ?? []) : [];
  const barKeys =
    chart.type === "combo"
      ? chart.series.filter((s) => !lineKeys.includes(s))
      : chart.series;
  const stacked = chart.type === "stacked_bar";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ left: 4, right: 16, top: 8 }}>
        <defs>
          {chart.series.map((key, i) => (
            <linearGradient key={key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(key, i)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={seriesColor(key, i)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
        <XAxis
          dataKey={chart.x}
          tickFormatter={(v) => shortLabel(String(v))}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={18}
        />
        <YAxis
          tickFormatter={(v) => formatTick(Number(v), format)}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        {lineKeys.length > 0 && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => formatTick(Number(v), "percent")}
            axisLine={false}
            tickLine={false}
            width={44}
          />
        )}
        <Tooltip
          content={<GlassTooltip format={format} labelMap={labelMap} />}
          cursor={{ fill: "rgba(99,102,241,0.08)" }}
        />
        {(chart.series.length > 1 || lineKeys.length > 0) && (
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(v) => (
              <span className="text-xs text-ink-2">{labelMap[String(v)] ?? String(v)}</span>
            )}
          />
        )}

        {chart.type === "line" &&
          chart.series.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={seriesColor(key, i)}
              strokeWidth={2.4}
              dot={data.length <= 20 ? { r: 3, strokeWidth: 0, fill: seriesColor(key, i) } : false}
              activeDot={{ r: 4.5 }}
              animationDuration={800}
            />
          ))}

        {chart.type === "area" &&
          chart.series.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={seriesColor(key, i)}
              strokeWidth={2.4}
              fill={`url(#${gradientId}-${i})`}
              animationDuration={800}
            />
          ))}

        {(chart.type === "bar" || stacked || chart.type === "combo") &&
          barKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={stacked ? "stack" : undefined}
              fill={seriesColor(key, i)}
              radius={stacked ? [0, 0, 0, 0] : [6, 6, 0, 0]}
              maxBarSize={36}
              animationDuration={700}
            />
          ))}

        {lineKeys.map((key, i) => (
          <Line
            key={key}
            yAxisId="right"
            type="monotone"
            dataKey={key}
            stroke={seriesColor(key, barKeys.length + i)}
            strokeWidth={2.4}
            dot={{ r: 3, strokeWidth: 0, fill: seriesColor(key, barKeys.length + i) }}
            animationDuration={800}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
