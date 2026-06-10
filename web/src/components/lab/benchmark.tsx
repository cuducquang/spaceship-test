"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Database,
  FlaskConical,
  Loader2,
  Play,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type { ChartPayloadData } from "@/lib/agent/events";
import { DynamicChart } from "@/components/charts/dynamic-chart";
import { Select } from "@/components/ui/select";
import { parseCsvObjects } from "@/lib/data/csv";
import {
  detectColumns,
  MODEL_KINDS,
  MODEL_LABELS,
  type BenchmarkResult,
  type ColumnInfo,
  type FeatureSpec,
  type ModelKind,
  type Row,
} from "@/lib/ml/engine";
import { cn } from "@/lib/utils";

const MODEL_HINTS: Record<ModelKind, string> = {
  dummy: "Predicts the class prior — every real model must beat this.",
  logreg: "Linear, balanced class weights, L2 — the notebook's reference model.",
  tree: "CART (gini), depth ≤ 4 — captures simple interactions, explainable splits.",
  knn: "Distance-weighted k=9 on standardized features — non-parametric sanity check.",
};

/** Offline study results baked from ml/eda_and_delay_model.ipynb. */
const NOTEBOOK_REFERENCE = [
  { label: "Dummy (prior)", auc: 0.5 },
  { label: "Logistic regression", auc: 0.465 },
  { label: "Random forest", auc: 0.466 },
];

interface DataState {
  source: "bundled" | "upload";
  rows: Row[];
  columns: ColumnInfo[];
  note?: string;
  fileName?: string;
}

export function Benchmark() {
  const [data, setData] = useState<DataState | null>(null);
  const [target, setTarget] = useState<string>("");
  const [positive, setPositive] = useState<string>("");
  const [features, setFeatures] = useState<FeatureSpec[]>([]);
  const [models, setModels] = useState<Set<ModelKind>>(new Set(MODEL_KINDS));
  const [folds, setFolds] = useState<3 | 5>(5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ----- bundled dataset ----- */
  const loadBundled = useCallback(async () => {
    const res = await fetch("/api/ml/dataset");
    const json = await res.json();
    const rows: Row[] = json.rows;
    setData({
      source: "bundled",
      rows,
      columns: detectColumns(rows),
      note: json.preset.note,
    });
    setTarget(json.preset.target);
    setPositive(json.preset.positive);
    setFeatures(json.preset.features);
    setResult(null);
  }, []);

  useEffect(() => {
    void loadBundled();
  }, [loadBundled]);

  /* ----- upload ----- */
  const onUpload = async (file: File) => {
    setError(null);
    if (file.size > 2 * 1024 * 1024) {
      setError("CSV too large — 2 MB max for the in-browser lab.");
      return;
    }
    const text = await file.text();
    let rows: Row[] = parseCsvObjects(text);
    if (rows.length < 40) {
      setError(`Only ${rows.length} rows — need at least 40 to cross-validate meaningfully.`);
      return;
    }
    if (rows.length > 5000) rows = rows.slice(0, 5000);
    const columns = detectColumns(rows);
    const guessTarget =
      columns.find((c) => c.kind === "categorical" && c.distinct === 2)?.name ??
      columns[columns.length - 1].name;
    setData({ source: "upload", rows, columns, fileName: file.name });
    setTarget(guessTarget);
    const firstVal = String(rows.find((r) => r[guessTarget] != null)?.[guessTarget] ?? "");
    setPositive(firstVal);
    setFeatures(
      columns
        .filter((c) => c.name !== guessTarget && c.distinct > 1)
        .slice(0, 12)
        .map((c) => ({ name: c.name, kind: c.kind })),
    );
    setResult(null);
  };

  /* ----- derived ----- */
  const targetValues = useMemo(() => {
    if (!data || !target) return [];
    const counts = new Map<string, number>();
    for (const r of data.rows) {
      const v = String(r[target] ?? "");
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [data, target]);

  const toggleFeature = (col: ColumnInfo) => {
    setFeatures((prev) =>
      prev.some((f) => f.name === col.name)
        ? prev.filter((f) => f.name !== col.name)
        : [...prev, { name: col.name, kind: col.kind }],
    );
  };

  const flipKind = (name: string) => {
    setFeatures((prev) =>
      prev.map((f) =>
        f.name === name
          ? { ...f, kind: f.kind === "numeric" ? "categorical" : "numeric" }
          : f,
      ),
    );
  };

  /* ----- train ----- */
  const train = async () => {
    if (!data) return;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/ml/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: data.rows,
          target,
          positive,
          features,
          models: [...models],
          folds,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Training failed");
      setResult(json.result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const bestReal = result?.results.find((r) => r.model !== "dummy");
  const comparisonChart: ChartPayloadData | null = result
    ? {
        type: "bar",
        title: "Model comparison",
        x: "label",
        series: ["auc_mean", "f1"],
        value_format: "percent",
        columns: [
          { key: "label", label: "Model" },
          { key: "auc_mean", label: "ROC-AUC (CV mean)" },
          { key: "f1", label: "F1 @0.5" },
        ],
        rows: result.results.map((r) => ({ label: r.label, auc_mean: r.auc_mean, f1: r.f1 })),
      }
    : null;

  return (
    <div className="space-y-4">
      {/* 1 · data */}
      <section className="card p-5">
        <StepTitle n={1} title="Data" />
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => void loadBundled()}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all",
              data?.source === "bundled"
                ? "border-brand-2 bg-brand-soft text-brand shadow-sm"
                : "border-border bg-panel text-ink-2 hover:border-brand-2",
            )}
          >
            <Database size={14} />
            Bundled logistics dataset
            <span className="font-normal text-ink-3">370 completed orders</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all",
              data?.source === "upload"
                ? "border-brand-2 bg-brand-soft text-brand shadow-sm"
                : "border-dashed border-border-2 bg-panel text-ink-2 hover:border-brand-2",
            )}
          >
            <Upload size={14} />
            {data?.source === "upload" ? `Uploaded: ${data.fileName}` : "Upload your CSV"}
            <span className="font-normal text-ink-3">≤ 2 MB · ≤ 5,000 rows</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
              e.target.value = "";
            }}
          />
        </div>

        {data && (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="stat-label">Target column (what to predict)</span>
                <Select
                  value={target}
                  onValueChange={(t) => {
                    setTarget(t);
                    const counts = new Map<string, number>();
                    for (const r of data.rows) {
                      const v = String(r[t] ?? "");
                      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
                    }
                    setPositive([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "");
                    setFeatures((prev) => prev.filter((f) => f.name !== t));
                  }}
                  options={data.columns.map((c) => ({
                    value: c.name,
                    label: c.name,
                    hint: `${c.distinct} distinct`,
                  }))}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="stat-label">Positive class (the event of interest)</span>
                <Select
                  value={positive}
                  onValueChange={setPositive}
                  options={targetValues.map(([v, n]) => ({
                    value: v,
                    label: v,
                    hint: `${n} rows (${Math.round((n / data.rows.length) * 100)}%)`,
                  }))}
                />
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="stat-label">Rows</span>
                <div className="flex h-10 items-center rounded-xl border border-border bg-panel-2 px-3.5 text-[13px] font-semibold text-ink">
                  {data.rows.length.toLocaleString()}
                  {targetValues.length === 2 && (
                    <span className="ml-2 font-normal text-ink-3">· binary target ✓</span>
                  )}
                </div>
              </div>
            </div>

            <div>
              <span className="stat-label">
                Features ({features.length} selected — click to toggle, click the badge to flip
                type)
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.columns
                  .filter((c) => c.name !== target)
                  .map((c) => {
                    const selected = features.find((f) => f.name === c.name);
                    return (
                      <button
                        key={c.name}
                        onClick={() => toggleFeature(c)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-all",
                          selected
                            ? "border-brand-2 bg-brand-soft text-brand"
                            : "border-border bg-panel text-ink-3 hover:text-ink-2",
                        )}
                      >
                        {c.name}
                        <span
                          onClick={(e) => {
                            if (!selected) return;
                            e.stopPropagation();
                            flipKind(c.name);
                          }}
                          className={cn(
                            "rounded-full px-1.5 py-px text-[9px] font-bold uppercase",
                            (selected?.kind ?? c.kind) === "numeric"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-violet/10 text-violet",
                          )}
                        >
                          {(selected?.kind ?? c.kind) === "numeric" ? "num" : "cat"}
                        </span>
                      </button>
                    );
                  })}
              </div>
              {data.note && <p className="mt-2.5 text-[11.5px] text-ink-3">{data.note}</p>}
            </div>
          </>
        )}
      </section>

      {/* 2 · models */}
      <section className="card p-5">
        <StepTitle n={2} title="Models & validation" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODEL_KINDS.map((kind) => {
            const on = models.has(kind);
            return (
              <button
                key={kind}
                onClick={() =>
                  setModels((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind)) {
                      if (next.size > 1) next.delete(kind);
                    } else next.add(kind);
                    return next;
                  })
                }
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  on
                    ? "border-brand-2 bg-brand-soft/60 shadow-sm"
                    : "border-border bg-panel opacity-60 hover:opacity-90",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full border-2",
                      on ? "border-brand bg-brand" : "border-border-2",
                    )}
                  />
                  <span className="text-[13px] font-bold text-ink">{MODEL_LABELS[kind]}</span>
                </div>
                <p className="mt-1 pl-4.5 text-[11px] leading-relaxed text-ink-3">
                  {MODEL_HINTS[kind]}
                </p>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="stat-label">Cross-validation</span>
            <Select
              size="sm"
              className="w-[120px]"
              value={String(folds)}
              onValueChange={(v) => setFolds(Number(v) as 3 | 5)}
              options={[
                { value: "3", label: "3 folds" },
                { value: "5", label: "5 folds" },
              ]}
            />
          </label>
          <span className="text-[11px] text-ink-3">
            stratified · encoders fit on training folds only (no leakage)
          </span>
          <div className="flex-1" />
          <button onClick={train} disabled={running || !data || !target || !positive} className="btn-primary">
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {running ? "Training…" : "Train & benchmark"}
          </button>
        </div>
        {error && (
          <p className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
            <TriangleAlert size={13} /> {error}
          </p>
        )}
      </section>

      {/* 3 · results */}
      {result && (
        <section className="card block-enter p-5">
          <StepTitle n={3} title="Results" />

          {/* verdict */}
          <div
            className={cn(
              "mb-4 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed",
              (bestReal?.auc_mean ?? 0) >= 0.65
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            {(bestReal?.auc_mean ?? 0) >= 0.65 ? (
              <>
                <strong>Possible signal:</strong> best model {bestReal?.label} reaches CV AUC{" "}
                {bestReal?.auc_mean} (±{bestReal?.auc_std}). Before trusting it, run a permutation
                test like the research notebook does — apparent structure at this sample size can
                still be luck.
              </>
            ) : (
              <>
                <strong>No deployable signal:</strong> best model {bestReal?.label ?? "—"} reaches
                CV AUC {bestReal?.auc_mean ?? "—"} (±{bestReal?.auc_std ?? "—"}) vs the 0.65 bar —
                consistent with the notebook&apos;s pre-registered <em>no-ship</em> decision
                (offline LR AUC 0.465, permutation p = 0.68).
              </>
            )}
          </div>

          {/* stats strip */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            <span className="tag">n = {result.n}</span>
            <span className="tag">
              positives = {result.positives} ({Math.round(result.baseline_rate * 100)}%)
            </span>
            <span className="tag">{result.folds}-fold stratified CV</span>
            <span className="tag">
              {result.feature_count} features → {result.encoded_dims} encoded dims
            </span>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="mb-2 flex items-start gap-1.5 text-[11.5px] text-amber-700">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}

          {/* ranking table */}
          <div className="mb-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-panel-2 text-left text-ink-2">
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">ROC-AUC (CV)</th>
                  <th className="px-3 py-2 text-right font-semibold">Accuracy</th>
                  <th className="px-3 py-2 text-right font-semibold">F1</th>
                  <th className="px-3 py-2 text-right font-semibold">Fit</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={r.model} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold text-ink">
                      {i === 0 && <span className="mr-1.5">🏆</span>}
                      {r.label}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-36 overflow-hidden rounded-full bg-panel-2">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              r.auc_mean >= 0.65
                                ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                                : "bg-gradient-to-r from-brand-2 to-cyan",
                            )}
                            style={{
                              width: `${Math.min(100, Math.max(3, ((r.auc_mean - 0.3) / 0.55) * 100))}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono font-bold text-ink">{r.auc_mean.toFixed(3)}</span>
                        <span className="text-[10.5px] text-ink-3">±{r.auc_std.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.accuracy.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.f1.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-3">{r.fit_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* comparison chart + offline reference */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {comparisonChart && <DynamicChart chart={comparisonChart} height={240} />}
            </div>
            <div className="rounded-xl border border-border bg-panel-2/50 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-ink-2">
                <FlaskConical size={12} className="text-violet" />
                Offline study (research notebook)
              </div>
              {NOTEBOOK_REFERENCE.map((r) => (
                <div key={r.label} className="flex justify-between py-1 text-[12px]">
                  <span className="text-ink-2">{r.label}</span>
                  <span className="font-mono font-semibold text-ink">{r.auc.toFixed(3)}</span>
                </div>
              ))}
              <p className="mt-2 border-t border-border pt-2 text-[10.5px] leading-relaxed text-ink-3">
                sklearn, 5-fold CV, permutation p = 0.68 → pre-registered no-ship. See the
                Notebook tab for the full study.
              </p>
            </div>
          </div>

          {/* per-model explanations */}
          <div className="mt-4 space-y-2">
            {result.results
              .filter((r) => r.details)
              .map((r) => (
                <ModelDetails key={r.model} label={r.label} details={r.details!} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan text-[12px] font-bold text-white">
        {n}
      </span>
      <h3 className="font-display text-[15px] font-bold text-ink">{title}</h3>
    </div>
  );
}

function ModelDetails({
  label,
  details,
}: {
  label: string;
  details: NonNullable<BenchmarkResult["results"][number]["details"]>;
}) {
  const [open, setOpen] = useState(false);
  const maxAbs = Math.max(...details.items.map((i) => Math.abs(i.weight)), 1e-6);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel-2/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3.5 py-2 text-[12px] font-semibold text-ink-2 hover:bg-panel-2"
      >
        <span>
          {label} — {details.kind === "coefficients" ? "top coefficients" : "feature importances"}
        </span>
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border px-3.5 py-3">
          {details.items.map((item) => (
            <div key={item.feature} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-44 truncate font-mono text-ink-2" title={item.feature}>
                {item.feature}
              </span>
              <div className="relative h-2.5 flex-1 rounded-full bg-panel">
                <div
                  className={cn(
                    "absolute top-0 h-full rounded-full",
                    item.weight >= 0 ? "left-1/2 bg-brand-2" : "right-1/2 bg-rose-400",
                  )}
                  style={{ width: `${(Math.abs(item.weight) / maxAbs) * 48}%` }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-border-2" />
              </div>
              <span className="w-14 text-right font-mono text-ink">{item.weight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
