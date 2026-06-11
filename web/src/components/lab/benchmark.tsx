"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Crown,
  Database,
  FlaskConical,
  Loader2,
  Play,
  Settings2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Select } from "@/components/ui/select";
import { parseCsvObjects } from "@/lib/data/csv";
import {
  detectColumns,
  MODEL_KINDS,
  MODEL_LABELS,
  MODEL_TRAITS,
  type BenchmarkResult,
  type ColumnInfo,
  type FeatureSpec,
  type ModelKind,
  type ModelParams,
  type ModelReport,
  type Row,
} from "@/lib/ml/engine";
import { cn } from "@/lib/utils";

const MODEL_HINTS: Record<ModelKind, string> = {
  dummy: "Predicts the class prior. Every real model must beat this.",
  logreg: "Linear, balanced class weights, L2. The notebook's reference model.",
  nb: "Gaussian class densities. Fast, and surprisingly strong on small data.",
  tree: "CART (gini). Captures simple interactions with fully explainable splits.",
  forest: "Bagged CARTs on √d feature subspaces. The power option, least transparent.",
  knn: "Distance weighted votes on standardized features. A nonparametric sanity check.",
};

const MODEL_COLORS: Record<ModelKind, string> = {
  dummy: "#64748b",
  logreg: "#0891b2",
  nb: "#059669",
  tree: "#d97706",
  forest: "#6366f1",
  knn: "#db2777",
};

/** Offline study results baked from ml/eda_and_delay_model.ipynb. */
const NOTEBOOK_REFERENCE = [
  { label: "Dummy (prior)", auc: 0.5 },
  { label: "Logistic regression", auc: 0.465 },
  { label: "Random forest", auc: 0.466 },
];

type LiveState = "queued" | "running" | "done";

interface DataState {
  source: "bundled" | "upload";
  rows: Row[];
  columns: ColumnInfo[];
  note?: string;
  fileName?: string;
}

const DEFAULT_PARAMS = {
  logreg: { l2: 0.01, epochs: 400 },
  tree: { max_depth: 4, min_leaf: 8 },
  forest: { trees: 40, max_depth: 6 },
  knn: { k: 9 },
};

type ParamsState = typeof DEFAULT_PARAMS;

/* ------------------------------------------------------------------ */
/* small pieces                                                         */
/* ------------------------------------------------------------------ */

function Battery({ level, title }: { level: number; title?: string }) {
  return (
    <span className="battery" title={title ?? `interpretability ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? "on" : ""} />
      ))}
    </span>
  );
}

function Stage({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "idle" | "active" | "done";
  children: React.ReactNode;
}) {
  return (
    <div className="pipe-row pb-5">
      <span className="pipe-line" />
      <span
        className={cn(
          "pipe-node !h-7 !w-7 font-display text-[12px] font-bold",
          state === "active" && "pipe-node-running text-cyan",
          state === "done" && "pipe-node-done text-good",
          state === "idle" && "text-ink-3",
        )}
      >
        {state === "done" ? <Check size={13} strokeWidth={3} /> : n}
      </span>
      <div>
        <h3 className="font-display mb-2 pt-0.5 text-[15px] font-bold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-2 text-[10.5px] text-ink-3">
      <span className="w-16 shrink-0 font-semibold uppercase tracking-wide">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 accent-[#6366f1]"
      />
      <span className="num w-12 shrink-0 text-right font-mono text-[11px] font-bold text-ink">
        {fmt ? fmt(value) : value}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ */

export function Benchmark() {
  const [data, setData] = useState<DataState | null>(null);
  const [target, setTarget] = useState<string>("");
  const [positive, setPositive] = useState<string>("");
  const [features, setFeatures] = useState<FeatureSpec[]>([]);
  const [models, setModels] = useState<Set<ModelKind>>(new Set(MODEL_KINDS));
  const [params, setParams] = useState<ParamsState>(DEFAULT_PARAMS);
  const [tuneOpen, setTuneOpen] = useState<ModelKind | null>(null);
  const [folds, setFolds] = useState<3 | 5>(5);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<Partial<Record<ModelKind, LiveState>>>({});
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.5);
  const [focusModel, setFocusModel] = useState<ModelKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ----- bundled dataset ----- */
  const loadBundled = useCallback(async () => {
    const res = await fetch("/api/ml/dataset");
    const json = await res.json();
    const rows: Row[] = json.rows;
    setData({ source: "bundled", rows, columns: detectColumns(rows), note: json.preset.note });
    setTarget(json.preset.target);
    setPositive(json.preset.positive);
    setFeatures(json.preset.features);
    setResult(null);
    setLive({});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadBundled(), 0);
    return () => clearTimeout(t);
  }, [loadBundled]);

  /* ----- upload ----- */
  const onUpload = async (file: File) => {
    setError(null);
    if (file.size > 2 * 1024 * 1024) {
      setError("CSV too large. 2 MB max for the in browser lab.");
      return;
    }
    const text = await file.text();
    let rows: Row[] = parseCsvObjects(text);
    if (rows.length < 40) {
      setError(`Only ${rows.length} rows. At least 40 are needed to cross validate meaningfully.`);
      return;
    }
    if (rows.length > 5000) rows = rows.slice(0, 5000);
    const columns = detectColumns(rows);
    const guessTarget =
      columns.find((c) => c.kind === "categorical" && c.distinct === 2)?.name ??
      columns[columns.length - 1].name;
    setData({ source: "upload", rows, columns, fileName: file.name });
    setTarget(guessTarget);
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[guessTarget] ?? "");
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    setPositive([...counts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? "");
    setFeatures(
      columns
        .filter((c) => c.name !== guessTarget && c.distinct > 1)
        .slice(0, 12)
        .map((c) => ({ name: c.name, kind: c.kind })),
    );
    setResult(null);
    setLive({});
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
        f.name === name ? { ...f, kind: f.kind === "numeric" ? "categorical" : "numeric" } : f,
      ),
    );
  };

  /* ----- sequential training: each model fits live, one after another ----- */
  const train = async () => {
    if (!data) return;
    const selected = MODEL_KINDS.filter((k) => models.has(k));
    setRunning(true);
    setError(null);
    setResult(null);
    setFocusModel(null);
    setThreshold(0.5);
    setLive(Object.fromEntries(selected.map((k) => [k, "queued" as LiveState])));

    const sendParams: ModelParams = params;
    const acc: ModelReport[] = [];
    let shared: BenchmarkResult | null = null;
    try {
      for (const kind of selected) {
        setLive((s) => ({ ...s, [kind]: "running" }));
        const res = await fetch("/api/ml/train", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: data.rows,
            target,
            positive,
            features,
            models: [kind],
            folds,
            params: sendParams,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Training failed");
        const r: BenchmarkResult = json.result;
        if (!shared) shared = r;
        acc.push(...r.results);
        acc.sort((a, b) => b.auc_mean - a.auc_mean);
        setResult({ ...shared, results: [...acc] });
        setLive((s) => ({ ...s, [kind]: "done" }));
      }
    } catch (err) {
      setError((err as Error).message);
      setLive({});
    } finally {
      setRunning(false);
    }
  };

  const reportFor = (kind: ModelKind) => result?.results.find((r) => r.model === kind);
  const rankFor = (kind: ModelKind) => {
    const idx = result?.results.findIndex((r) => r.model === kind) ?? -1;
    return idx >= 0 ? idx + 1 : null;
  };

  const bestReal = result?.results.find((r) => r.model !== "dummy");
  const champion = result?.results[0];
  const allDone = !running && result !== null;
  const focused =
    (focusModel && reportFor(focusModel)) ||
    bestReal ||
    result?.results[0] ||
    null;
  const thresholdPoint = focused?.thresholds?.reduce(
    (best, p) => (Math.abs(p.threshold - threshold) < Math.abs(best.threshold - threshold) ? p : best),
    focused.thresholds[0],
  );

  return (
    <div>
      {/* ------------------------- stage 1 · data ------------------------- */}
      <Stage n={1} title="Data" state={data ? "done" : "active"}>
        <div className="card space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadBundled()}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                data?.source === "bundled"
                  ? "border-brand-2 bg-brand-soft shadow-sm"
                  : "border-border bg-panel hover:border-brand-2/50",
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-500 text-white shadow-sm">
                <Database size={14} />
              </span>
              <span>
                <span className="block text-[12.5px] font-bold text-ink">
                  Bundled logistics dataset
                </span>
                <span className="block text-[10.5px] text-ink-3">
                  370 completed orders · late vs on time
                </span>
              </span>
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all",
                data?.source === "upload"
                  ? "border-brand-2 bg-brand-soft shadow-sm"
                  : "border-dashed border-border-2 bg-panel hover:border-brand-2/60",
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan text-white shadow-sm">
                <Upload size={14} />
              </span>
              <span>
                <span className="block text-[12.5px] font-bold text-ink">
                  {data?.source === "upload" ? data.fileName : "Upload your CSV"}
                </span>
                <span className="block text-[10.5px] text-ink-3">≤ 2 MB · 40 to 5,000 rows</span>
              </span>
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
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                      setPositive(
                        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
                      );
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
                  <span className="stat-label">Positive class (event of interest)</span>
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
                  <div className="num flex h-10 items-center rounded-xl border border-border bg-panel-2 px-3.5 font-mono text-[13px] font-bold text-ink">
                    {data.rows.length.toLocaleString()}
                    {targetValues.length === 2 && (
                      <span className="ml-2 font-sans text-[11px] font-medium text-good">
                        binary target ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <span className="stat-label">
                  Features ({features.length} selected. Click to toggle, click the badge to flip
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
                              ? "border-brand-2 bg-brand-soft text-brand shadow-sm"
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
                                ? "bg-sky/15 text-sky"
                                : "bg-violet/15 text-violet",
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
        </div>
      </Stage>

      {/* ------------------------- stage 2 · model design ------------------------- */}
      <Stage n={2} title="Model design & validation" state={allDone ? "done" : data ? "active" : "idle"}>
        <div className="card p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {MODEL_KINDS.map((kind) => {
              const on = models.has(kind);
              const state = live[kind];
              const report = reportFor(kind);
              const rank = rankFor(kind);
              const traits = MODEL_TRAITS[kind];
              const tunable = kind !== "dummy" && kind !== "nb";
              return (
                <div
                  key={kind}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    !running &&
                    setModels((prev) => {
                      const next = new Set(prev);
                      if (next.has(kind)) {
                        if (next.size > 1) next.delete(kind);
                      } else next.add(kind);
                      return next;
                    })
                  }
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).click()}
                  className={cn(
                    "relative cursor-pointer rounded-xl border p-3 text-left transition-all",
                    state === "running" && "conic-border",
                    on
                      ? "border-brand-2/60 bg-brand-soft/40 shadow-sm"
                      : "border-border bg-panel opacity-55 hover:opacity-90",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full border-2"
                      style={{
                        borderColor: on ? MODEL_COLORS[kind] : "var(--border-2)",
                        background: on ? MODEL_COLORS[kind] : "transparent",
                      }}
                    />
                    <span className="text-[13px] font-bold text-ink">{MODEL_LABELS[kind]}</span>
                    <span className="flex-1" />
                    {state === "queued" && <Clock size={12} className="text-ink-3" />}
                    {state === "running" && (
                      <span className="shimmer-text text-[10.5px] font-bold">
                        fitting {folds} folds…
                      </span>
                    )}
                    {state === "done" && report && (
                      <span className="flex items-center gap-1.5">
                        {rank === 1 && <Crown size={11} className="text-amber-400" />}
                        <span className="num font-mono text-[11.5px] font-bold text-ink">
                          {report.auc_mean.toFixed(3)}
                        </span>
                        <Check size={11} strokeWidth={3} className="text-good" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 pl-4.5">
                    <span className="rounded-full bg-panel-2 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-ink-3">
                      {traits.family}
                    </span>
                    <Battery level={traits.interpretability} />
                    {tunable && on && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTuneOpen((t) => (t === kind ? null : kind));
                        }}
                        className={cn(
                          "ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                          tuneOpen === kind
                            ? "bg-brand-soft text-brand"
                            : "text-ink-3 hover:bg-panel-2 hover:text-ink-2",
                        )}
                      >
                        <Settings2 size={11} />
                        tune
                      </button>
                    )}
                  </div>
                  <p className="mt-1 pl-4.5 text-[11px] leading-relaxed text-ink-3">
                    {MODEL_HINTS[kind]}
                  </p>
                  {tuneOpen === kind && on && (
                    <div
                      className="mt-2 space-y-1.5 rounded-lg border border-border bg-panel-2/60 p-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {kind === "logreg" && (
                        <>
                          <ParamSlider
                            label="L2 reg"
                            value={[0.001, 0.01, 0.1, 0.5].indexOf(params.logreg.l2)}
                            min={0}
                            max={3}
                            onChange={(i) =>
                              setParams((p) => ({ ...p, logreg: { ...p.logreg, l2: [0.001, 0.01, 0.1, 0.5][i] } }))
                            }
                            fmt={(i) => String([0.001, 0.01, 0.1, 0.5][i])}
                          />
                          <ParamSlider
                            label="epochs"
                            value={params.logreg.epochs}
                            min={100}
                            max={1000}
                            step={100}
                            onChange={(v) => setParams((p) => ({ ...p, logreg: { ...p.logreg, epochs: v } }))}
                          />
                        </>
                      )}
                      {kind === "tree" && (
                        <>
                          <ParamSlider
                            label="max depth"
                            value={params.tree.max_depth}
                            min={1}
                            max={10}
                            onChange={(v) => setParams((p) => ({ ...p, tree: { ...p.tree, max_depth: v } }))}
                          />
                          <ParamSlider
                            label="min leaf"
                            value={params.tree.min_leaf}
                            min={2}
                            max={30}
                            onChange={(v) => setParams((p) => ({ ...p, tree: { ...p.tree, min_leaf: v } }))}
                          />
                        </>
                      )}
                      {kind === "forest" && (
                        <>
                          <ParamSlider
                            label="trees"
                            value={params.forest.trees}
                            min={10}
                            max={120}
                            step={10}
                            onChange={(v) => setParams((p) => ({ ...p, forest: { ...p.forest, trees: v } }))}
                          />
                          <ParamSlider
                            label="max depth"
                            value={params.forest.max_depth}
                            min={2}
                            max={10}
                            onChange={(v) => setParams((p) => ({ ...p, forest: { ...p.forest, max_depth: v } }))}
                          />
                        </>
                      )}
                      {kind === "knn" && (
                        <ParamSlider
                          label="k"
                          value={params.knn.k}
                          min={1}
                          max={51}
                          step={2}
                          onChange={(v) => setParams((p) => ({ ...p, knn: { k: v } }))}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="stat-label">Cross validation</span>
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
            <button
              onClick={train}
              disabled={running || !data || !target || !positive}
              className="btn-primary"
            >
              {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {running ? "Training…" : "Train & benchmark"}
            </button>
          </div>
          {error && (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-bad/25 bg-bad/10 px-3 py-2 text-[12px] text-bad">
              <TriangleAlert size={13} /> {error}
            </p>
          )}
        </div>
      </Stage>

      {/* ------------------------- stage 3 · results ------------------------- */}
      {(result || running) && (
        <Stage n={3} title="Results & tradeoffs" state={allDone ? "done" : "active"}>
          <div className="card block-enter p-4">
            {/* verdict */}
            {allDone && (
              <div
                className={cn(
                  "mb-4 rounded-xl border px-4 py-3 text-[12.5px] leading-relaxed",
                  (bestReal?.auc_mean ?? 0) >= 0.65
                    ? "border-good/30 bg-good/10 text-good"
                    : "border-warn/30 bg-warn/10 text-warn",
                )}
              >
                {(bestReal?.auc_mean ?? 0) >= 0.65 ? (
                  <>
                    <strong>Possible signal:</strong> best model {bestReal?.label} reaches CV AUC{" "}
                    {bestReal?.auc_mean} (±{bestReal?.auc_std}). Before trusting it, run a
                    permutation test like the research notebook does, because apparent structure at this
                    sample size can still be luck.
                  </>
                ) : (
                  <>
                    <strong>No deployable signal:</strong> best model {bestReal?.label ?? "—"}{" "}
                    reaches CV AUC {bestReal?.auc_mean ?? "—"} (±{bestReal?.auc_std ?? "—"}) vs the
                    0.65 bar, consistent with the notebook&apos;s preregistered <em>no ship</em>{" "}
                    decision (offline LR AUC 0.465, permutation p = 0.68).
                  </>
                )}
              </div>
            )}

            {/* stats strip */}
            {result && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                <span className="tag num">n = {result.n}</span>
                <span className="tag num">
                  positives = {result.positives} ({Math.round(result.baseline_rate * 100)}%)
                </span>
                <span className="tag">{result.folds} fold stratified CV</span>
                <span className="tag num">
                  {result.feature_count} features → {result.encoded_dims} encoded dims
                </span>
              </div>
            )}
            {result?.warnings.map((w) => (
              <p key={w} className="mb-2 flex items-start gap-1.5 text-[11.5px] text-warn">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}

            {/* leaderboard */}
            {result && (
              <div className="mb-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead>
                    <tr className="bg-panel-2 text-left text-ink-2">
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Model</th>
                      <th className="px-3 py-2 font-semibold">ROC AUC (CV)</th>
                      <th className="px-3 py-2 text-right font-semibold">Acc</th>
                      <th className="px-3 py-2 text-right font-semibold">F1</th>
                      <th className="px-3 py-2 text-center font-semibold" title="interpretability">
                        Interp.
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">Fit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr
                        key={r.model}
                        onClick={() => setFocusModel(r.model)}
                        className={cn(
                          "cursor-pointer border-t border-border transition-colors hover:bg-panel-2/60",
                          r.model === focused?.model && "bg-brand-soft/30",
                          i === 0 && result.results.length > 1 && "border-l-2 border-l-cyan-400",
                        )}
                      >
                        <td className="num px-3 py-2 font-mono text-ink-3">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold text-ink">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: MODEL_COLORS[r.model] }}
                            />
                            {r.label}
                            {i === 0 && result.results.length > 1 && (
                              <Crown size={12} className="text-amber-400" />
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-panel-2 sm:w-36">
                              <div
                                className={cn(
                                  "bar-grow h-full rounded-full",
                                  r.auc_mean >= 0.65
                                    ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                    : "bg-gradient-to-r from-cyan-400 to-indigo-500",
                                )}
                                style={{
                                  width: `${Math.min(100, Math.max(3, ((r.auc_mean - 0.3) / 0.55) * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="num font-mono font-bold text-ink">
                              {r.auc_mean.toFixed(3)}
                            </span>
                            <span className="num text-[10.5px] text-ink-3">
                              ±{r.auc_std.toFixed(3)}
                            </span>
                          </div>
                        </td>
                        <td className="num px-3 py-2 text-right font-mono">{r.accuracy.toFixed(3)}</td>
                        <td className="num px-3 py-2 text-right font-mono">{r.f1.toFixed(3)}</td>
                        <td className="px-3 py-2 text-center">
                          <Battery level={r.traits.interpretability} />
                        </td>
                        <td className="num px-3 py-2 text-right font-mono text-ink-3">{r.fit_ms}ms</td>
                      </tr>
                    ))}
                    {running && (
                      <tr className="border-t border-border">
                        <td colSpan={7} className="px-3 py-2.5">
                          <span className="shimmer-text text-[12px] font-semibold">
                            fitting next model…
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* trade-off map + ROC overlay */}
            {allDone && result && result.results.length > 1 && (
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TradeoffMap results={result.results} championModel={champion?.model ?? null} />
                <RocOverlay results={result.results} />
              </div>
            )}

            {/* threshold explorer */}
            {allDone && focused?.thresholds && thresholdPoint && (
              <ThresholdExplorer
                report={focused}
                point={thresholdPoint}
                threshold={threshold}
                onThreshold={setThreshold}
                positive={positive}
              />
            )}

            {/* comparison vs offline study */}
            {allDone && result && (
              <div className="mt-4 rounded-xl border border-border bg-panel-2/50 p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-ink-2">
                  <FlaskConical size={12} className="text-violet" />
                  Offline study (research notebook, sklearn)
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {NOTEBOOK_REFERENCE.map((r) => (
                    <div key={r.label} className="flex items-baseline gap-2 py-0.5 text-[12px]">
                      <span className="text-ink-2">{r.label}</span>
                      <span className="num font-mono font-semibold text-ink">{r.auc.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 border-t border-border pt-2 text-[10.5px] leading-relaxed text-ink-3">
                  5 fold CV with permutation p = 0.68 led to the preregistered no ship decision. On the bundled data this
                  TypeScript lab independently reproduces that conclusion; see the Notebook tab for
                  the full study.
                </p>
              </div>
            )}

            {/* per-model explanations */}
            {allDone && result && (
              <div className="mt-4 space-y-2">
                {result.results
                  .filter((r) => r.details)
                  .map((r) => (
                    <ModelDetails key={r.model} label={r.label} details={r.details!} />
                  ))}
              </div>
            )}
          </div>
        </Stage>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* trade-off scatter — performance vs interpretability (Dataiku-style)  */
/* ------------------------------------------------------------------ */

function TradeoffMap({
  results,
  championModel,
}: {
  results: ModelReport[];
  championModel: ModelKind | null;
}) {
  const data = results.map((r) => ({
    x: r.traits.interpretability,
    y: r.auc_mean,
    z: Math.max(20, r.fit_ms),
    label: r.label,
    model: r.model,
    fit: r.fit_ms,
  }));
  const yMin = Math.min(0.4, ...data.map((d) => d.y)) - 0.04;
  const yMax = Math.max(0.7, ...data.map((d) => d.y)) + 0.04;
  return (
    <div className="rounded-xl border border-border bg-panel-2/40 p-3.5">
      <div className="mb-1 text-[11.5px] font-bold text-ink-2">
        Tradeoff map: performance vs interpretability
      </div>
      <p className="mb-1.5 text-[10.5px] text-ink-3">
        Bubble size = fit time. Top right is the deployment sweet spot: strong <em>and</em>{" "}
        explainable.
      </p>
      <ResponsiveContainer width="100%" height={230}>
        <ScatterChart margin={{ top: 12, right: 18, bottom: 4, left: -14 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(v) => ["", "black box", "low", "mid", "high", "glass box"][v] ?? ""}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[yMin, yMax]}
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "CV AUC",
              angle: -90,
              position: "insideLeft",
              offset: 22,
              style: { fontSize: 10, fill: "var(--ink-3)" },
            }}
          />
          <ZAxis type="number" dataKey="z" range={[80, 420]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: "var(--border-2)" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div className="glass rounded-xl px-3 py-2 text-[11.5px] shadow-lg">
                  <div className="font-bold text-ink">{p.label}</div>
                  <div className="num font-mono text-ink-2">
                    AUC {p.y.toFixed(3)} · fit {p.fit}ms
                  </div>
                  <div className="text-ink-3">interpretability {p.x}/5</div>
                </div>
              );
            }}
          />
          {data.map((d) => (
            <Scatter
              key={d.model}
              data={[d]}
              fill={MODEL_COLORS[d.model]}
              fillOpacity={d.model === championModel ? 0.95 : 0.55}
              stroke={d.model === championModel ? "#0e1c2e" : MODEL_COLORS[d.model]}
              strokeWidth={d.model === championModel ? 1.5 : 0}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {data.map((d) => (
          <span key={d.model} className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[d.model] }} />
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ROC overlay                                                          */
/* ------------------------------------------------------------------ */

function RocOverlay({ results }: { results: ModelReport[] }) {
  const withRoc = results.filter((r) => r.roc && r.roc.length > 1);
  return (
    <div className="rounded-xl border border-border bg-panel-2/40 p-3.5">
      <div className="mb-1 text-[11.5px] font-bold text-ink-2">
        ROC curves: out of fold predictions
      </div>
      <p className="mb-1.5 text-[10.5px] text-ink-3">
        The dashed diagonal is pure chance. Curves hugging it mean the features carry no signal.
      </p>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart margin={{ top: 12, right: 18, bottom: 4, left: -14 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            type="number"
            dataKey="fpr"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "false positive rate",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 10, fill: "var(--ink-3)" },
            }}
          />
          <YAxis
            type="number"
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tick={{ fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "true positive rate",
              angle: -90,
              position: "insideLeft",
              offset: 22,
              style: { fontSize: 10, fill: "var(--ink-3)" },
            }}
          />
          <Tooltip
            content={() => null}
            cursor={{ strokeDasharray: "3 3", stroke: "var(--border-2)" }}
          />
          <Line
            data={[
              { fpr: 0, tpr: 0 },
              { fpr: 1, tpr: 1 },
            ]}
            dataKey="tpr"
            stroke="var(--ink-3)"
            strokeDasharray="5 5"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
          {withRoc.map((r) => (
            <Line
              key={r.model}
              data={r.roc}
              dataKey="tpr"
              name={r.label}
              stroke={MODEL_COLORS[r.model]}
              strokeWidth={1.8}
              dot={false}
              animationDuration={700}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {withRoc.map((r) => (
          <span key={r.model} className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
            <span className="h-0.5 w-3.5 rounded" style={{ background: MODEL_COLORS[r.model] }} />
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* threshold explorer — confusion matrix at an operating point          */
/* ------------------------------------------------------------------ */

function ThresholdExplorer({
  report,
  point,
  threshold,
  onThreshold,
  positive,
}: {
  report: ModelReport;
  point: NonNullable<ModelReport["thresholds"]>[number];
  threshold: number;
  onThreshold: (v: number) => void;
  positive: string;
}) {
  const cells = [
    { label: `true ${positive}`, sub: "caught", value: point.tp, tone: "text-good" },
    { label: "false alarm", sub: "wrongly flagged", value: point.fp, tone: "text-warn" },
    { label: `missed ${positive}`, sub: "slipped through", value: point.fn, tone: "text-bad" },
    { label: "true negative", sub: "correctly cleared", value: point.tn, tone: "text-ink-2" },
  ];
  return (
    <div className="rounded-xl border border-border bg-panel-2/40 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] font-bold text-ink-2">
          Operating point: {report.label}
        </span>
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: MODEL_COLORS[report.model] }}
        />
        <span className="flex-1" />
        <span className="text-[10.5px] text-ink-3">click a leaderboard row to switch model</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="stat-label shrink-0">decision threshold</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={threshold}
          onChange={(e) => onThreshold(Number(e.target.value))}
          className="h-1 flex-1 accent-[#0891b2]"
        />
        <span className="num w-10 text-right font-mono text-[12px] font-bold text-cyan">
          {threshold.toFixed(2)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg bg-panel/80 px-2.5 py-2 text-center">
            <div className={cn("num font-mono text-[17px] font-bold", c.tone)}>{c.value}</div>
            <div className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-3">
              {c.label}
            </div>
            <div className="text-[9px] text-ink-3/70">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="num mt-2.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-ink-2">
        <span>precision {point.precision.toFixed(3)}</span>
        <span>recall {point.recall.toFixed(3)}</span>
        <span>F1 {point.f1.toFixed(3)}</span>
        <span>accuracy {point.accuracy.toFixed(3)}</span>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-ink-3">
        Lowering the threshold catches more {positive} cases (recall ↑) at the cost of false
        alarms (precision ↓), the operational tradeoff a deployment must choose. Counts are
        pooled out of fold predictions, so they reflect generalization, not training fit.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

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
          {label}: {details.kind === "coefficients" ? "top coefficients" : "feature importances"}
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
                    item.weight >= 0 ? "left-1/2 bg-cyan" : "right-1/2 bg-rose",
                  )}
                  style={{ width: `${(Math.abs(item.weight) / maxAbs) * 48}%` }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-border-2" />
              </div>
              <span className="num w-14 text-right font-mono text-ink">{item.weight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
