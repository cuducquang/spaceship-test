/**
 * Dependency-free ML engine for the in-app Lab: one-hot/standardize encoding,
 * four classifiers (prior baseline, logistic regression, CART decision tree,
 * k-NN), stratified k-fold cross-validation and ROC-AUC / accuracy / F1.
 *
 * Deliberately leakage-safe: encoders are fit on each training fold only.
 * Deterministic: seeded PRNG, no Math.random.
 */

/* ------------------------------------------------------------------ */
/* utilities                                                            */
/* ------------------------------------------------------------------ */

export type Row = Record<string, string | number | boolean | null | undefined>;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ------------------------------------------------------------------ */
/* column detection (shared with the upload UI)                          */
/* ------------------------------------------------------------------ */

export interface ColumnInfo {
  name: string;
  kind: "numeric" | "categorical";
  distinct: number;
  missing: number;
  sample: string[];
}

export function detectColumns(rows: Row[]): ColumnInfo[] {
  if (rows.length === 0) return [];
  const names = Object.keys(rows[0]);
  return names.map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== "");
    const distinct = new Set(values.map(String));
    const numericCount = values.filter(
      (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))),
    ).length;
    const kind =
      values.length > 0 && numericCount / values.length > 0.9 && distinct.size > 5
        ? "numeric"
        : "categorical";
    return {
      name,
      kind,
      distinct: distinct.size,
      missing: rows.length - values.length,
      sample: [...distinct].slice(0, 4),
    };
  });
}

/* ------------------------------------------------------------------ */
/* encoding                                                             */
/* ------------------------------------------------------------------ */

export interface FeatureSpec {
  name: string;
  kind: "numeric" | "categorical";
}

const MAX_LEVELS = 30;

interface Encoder {
  names: string[];
  encode(row: Row): number[];
}

function buildEncoder(rows: Row[], features: FeatureSpec[]): Encoder {
  const names: string[] = [];
  const plans: ((row: Row, out: number[]) => void)[] = [];

  for (const f of features) {
    if (f.kind === "numeric") {
      const vals = rows
        .map((r) => Number(r[f.name]))
        .filter((v) => Number.isFinite(v));
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const variance =
        vals.length > 1 ? vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1) : 1;
      const std = Math.sqrt(variance) || 1;
      names.push(f.name);
      plans.push((row, out) => {
        const v = Number(row[f.name]);
        out.push(Number.isFinite(v) ? (v - mean) / std : 0);
      });
    } else {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const v = String(r[f.name] ?? "");
        if (v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const levels = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_LEVELS)
        .map(([v]) => v);
      const levelIndex = new Map(levels.map((v, i) => [v, i]));
      for (const v of levels) names.push(`${f.name}=${v}`);
      plans.push((row, out) => {
        const base = out.length;
        for (let i = 0; i < levels.length; i++) out.push(0);
        const idx = levelIndex.get(String(row[f.name] ?? ""));
        if (idx !== undefined) out[base + idx] = 1;
      });
    }
  }

  return {
    names,
    encode(row: Row): number[] {
      const out: number[] = [];
      for (const plan of plans) plan(row, out);
      return out;
    },
  };
}

/* ------------------------------------------------------------------ */
/* metrics                                                              */
/* ------------------------------------------------------------------ */

export function rocAuc(yTrue: number[], scores: number[]): number {
  const order = yTrue
    .map((_, i) => i)
    .sort((a, b) => scores[a] - scores[b]);
  // average ranks (ties share the mean rank)
  const ranks = new Array<number>(yTrue.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && scores[order[j + 1]] === scores[order[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  let pos = 0;
  let rankSum = 0;
  for (let k = 0; k < yTrue.length; k++) {
    if (yTrue[k] === 1) {
      pos++;
      rankSum += ranks[k];
    }
  }
  const neg = yTrue.length - pos;
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function accuracyF1(yTrue: number[], scores: number[], threshold = 0.5) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = scores[i] >= threshold ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 1) fp++;
    else if (yTrue[i] === 1) fn++;
    else tn++;
  }
  const accuracy = (tp + tn) / Math.max(1, yTrue.length);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { accuracy, f1 };
}

/* ------------------------------------------------------------------ */
/* models                                                               */
/* ------------------------------------------------------------------ */

export const MODEL_KINDS = ["dummy", "logreg", "tree", "knn"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export const MODEL_LABELS: Record<ModelKind, string> = {
  dummy: "Baseline (prior)",
  logreg: "Logistic regression",
  tree: "Decision tree",
  knn: "k-nearest neighbors",
};

interface FittedModel {
  predictProba(X: number[][]): number[];
  details?: { kind: "coefficients" | "importances"; items: { feature: string; weight: number }[] };
}

function fitDummy(_X: number[][], y: number[]): FittedModel {
  const p = y.reduce((a, b) => a + b, 0) / Math.max(1, y.length);
  return { predictProba: (X) => X.map(() => p) };
}

function fitLogReg(X: number[][], y: number[], names: string[]): FittedModel {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const w = new Array<number>(d).fill(0);
  let b = 0;
  const pos = y.reduce((a, v) => a + v, 0);
  const neg = n - pos;
  const wPos = pos > 0 ? n / (2 * pos) : 1;
  const wNeg = neg > 0 ? n / (2 * neg) : 1;
  const lr = 0.1;
  const l2 = 0.01;
  const epochs = 400;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array<number>(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      const xi = X[i];
      for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const p = 1 / (1 + Math.exp(-z));
      const weight = y[i] === 1 ? wPos : wNeg;
      const err = (p - y[i]) * weight;
      for (let j = 0; j < d; j++) gw[j] += err * xi[j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * (gw[j] / n + l2 * w[j]));
    b -= lr * (gb / n);
  }

  return {
    predictProba: (Xt) =>
      Xt.map((xi) => {
        let z = b;
        for (let j = 0; j < d; j++) z += w[j] * xi[j];
        return 1 / (1 + Math.exp(-z));
      }),
    details: {
      kind: "coefficients",
      items: names
        .map((feature, j) => ({ feature, weight: Math.round(w[j] * 1000) / 1000 }))
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
        .slice(0, 10),
    },
  };
}

interface TreeNode {
  feature?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  proba?: number;
}

function fitTree(X: number[][], y: number[], names: string[]): FittedModel {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const maxDepth = 4;
  const minLeaf = Math.max(5, Math.floor(n / 50));
  const importances = new Array<number>(d).fill(0);

  const gini = (pos: number, total: number) => {
    if (total === 0) return 0;
    const p = pos / total;
    return 2 * p * (1 - p);
  };

  function thresholdsFor(idx: number[], j: number): number[] {
    const vals = [...new Set(idx.map((i) => X[i][j]))].sort((a, b) => a - b);
    if (vals.length <= 1) return [];
    if (vals.length === 2) return [(vals[0] + vals[1]) / 2];
    const out: number[] = [];
    const step = Math.max(1, Math.floor(vals.length / 16));
    for (let k = 0; k + 1 < vals.length; k += step) out.push((vals[k] + vals[k + 1]) / 2);
    return out;
  }

  function build(idx: number[], depth: number): TreeNode {
    const total = idx.length;
    const pos = idx.reduce((a, i) => a + y[i], 0);
    const proba = (pos + 1) / (total + 2); // Laplace smoothing
    if (depth >= maxDepth || total < 2 * minLeaf || pos === 0 || pos === total) {
      return { proba };
    }
    const parentGini = gini(pos, total);
    let best: { j: number; t: number; gain: number; left: number[]; right: number[] } | null = null;

    for (let j = 0; j < d; j++) {
      for (const t of thresholdsFor(idx, j)) {
        const left: number[] = [];
        const right: number[] = [];
        for (const i of idx) (X[i][j] <= t ? left : right).push(i);
        if (left.length < minLeaf || right.length < minLeaf) continue;
        const lp = left.reduce((a, i) => a + y[i], 0);
        const rp = right.reduce((a, i) => a + y[i], 0);
        const childGini =
          (left.length / total) * gini(lp, left.length) +
          (right.length / total) * gini(rp, right.length);
        const gain = parentGini - childGini;
        if (gain > 1e-6 && (!best || gain > best.gain)) best = { j, t, gain, left, right };
      }
    }

    if (!best) return { proba };
    importances[best.j] += best.gain * total;
    return {
      feature: best.j,
      threshold: best.t,
      left: build(best.left, depth + 1),
      right: build(best.right, depth + 1),
    };
  }

  const root = build(Array.from({ length: n }, (_, i) => i), 0);

  const predictOne = (x: number[]): number => {
    let node = root;
    while (node.proba === undefined) {
      node = x[node.feature!] <= node.threshold! ? node.left! : node.right!;
    }
    return node.proba;
  };

  const totalImp = importances.reduce((a, b) => a + b, 0) || 1;
  return {
    predictProba: (Xt) => Xt.map(predictOne),
    details: {
      kind: "importances",
      items: names
        .map((feature, j) => ({
          feature,
          weight: Math.round((importances[j] / totalImp) * 1000) / 1000,
        }))
        .filter((x) => x.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10),
    },
  };
}

function fitKnn(X: number[][], y: number[]): FittedModel {
  // subsample large training sets to keep prediction O(n·m) reasonable
  const cap = 1500;
  let trainX = X;
  let trainY = y;
  if (X.length > cap) {
    const idx = shuffled(X.length, 1234).slice(0, cap);
    trainX = idx.map((i) => X[i]);
    trainY = idx.map((i) => y[i]);
  }
  const k = Math.min(9, Math.max(3, trainX.length - 1));

  return {
    predictProba: (Xt) =>
      Xt.map((x) => {
        const dists: { d: number; y: number }[] = [];
        for (let i = 0; i < trainX.length; i++) {
          const xi = trainX[i];
          let d2 = 0;
          for (let j = 0; j < x.length; j++) {
            const diff = x[j] - xi[j];
            d2 += diff * diff;
          }
          dists.push({ d: Math.sqrt(d2), y: trainY[i] });
        }
        dists.sort((a, b) => a.d - b.d);
        let wSum = 0;
        let wPos = 0;
        for (let i = 0; i < k; i++) {
          const w = 1 / (dists[i].d + 1e-6);
          wSum += w;
          wPos += w * dists[i].y;
        }
        return wSum > 0 ? wPos / wSum : 0.5;
      }),
  };
}

function fitModel(kind: ModelKind, X: number[][], y: number[], names: string[]): FittedModel {
  switch (kind) {
    case "dummy":
      return fitDummy(X, y);
    case "logreg":
      return fitLogReg(X, y, names);
    case "tree":
      return fitTree(X, y, names);
    case "knn":
      return fitKnn(X, y);
  }
}

/* ------------------------------------------------------------------ */
/* stratified k-fold benchmark                                          */
/* ------------------------------------------------------------------ */

export interface BenchmarkRequest {
  rows: Row[];
  target: string;
  positive: string;
  features: FeatureSpec[];
  models: ModelKind[];
  folds: number;
}

export interface ModelReport {
  model: ModelKind;
  label: string;
  auc_mean: number;
  auc_std: number;
  accuracy: number;
  f1: number;
  fit_ms: number;
  details?: FittedModel["details"];
}

export interface BenchmarkResult {
  n: number;
  positives: number;
  baseline_rate: number;
  folds: number;
  feature_count: number;
  encoded_dims: number;
  results: ModelReport[];
  warnings: string[];
}

function stratifiedFolds(y: number[], k: number, seed = 42): number[][] {
  const posIdx = shuffled(y.length, seed).filter((i) => y[i] === 1);
  const negIdx = shuffled(y.length, seed + 1).filter((i) => y[i] === 0);
  const folds: number[][] = Array.from({ length: k }, () => []);
  posIdx.forEach((idx, i) => folds[i % k].push(idx));
  negIdx.forEach((idx, i) => folds[i % k].push(idx));
  return folds;
}

export function runBenchmark(req: BenchmarkRequest): BenchmarkResult {
  const warnings: string[] = [];

  let rows = req.rows.filter(
    (r) => r[req.target] !== null && r[req.target] !== undefined && String(r[req.target]) !== "",
  );
  if (rows.length < req.rows.length) {
    warnings.push(`${req.rows.length - rows.length} rows dropped (missing target).`);
  }
  if (rows.length > 5000) {
    rows = rows.slice(0, 5000);
    warnings.push("Capped at the first 5,000 rows.");
  }

  const y: number[] = rows.map((r) => (String(r[req.target]) === req.positive ? 1 : 0));
  const positives = y.reduce((a, b) => a + b, 0);
  const negatives = y.length - positives;

  if (positives < 10 || negatives < 10) {
    warnings.push(
      `Severe class imbalance (${positives} positive / ${negatives} negative) — metrics will be unstable.`,
    );
  }
  if (rows.length < 60) warnings.push("Very small dataset — expect huge variance across folds.");

  const k = Math.min(req.folds, Math.max(2, Math.min(positives, negatives)));
  if (k < req.folds) warnings.push(`Folds reduced to ${k} to keep both classes in every fold.`);
  const folds = stratifiedFolds(y, k);

  const results: ModelReport[] = [];

  for (const kind of req.models) {
    const aucs: number[] = [];
    const accs: number[] = [];
    const f1s: number[] = [];
    const t0 = Date.now();

    for (let f = 0; f < k; f++) {
      const testIdx = folds[f];
      const trainIdx = folds.filter((_, i) => i !== f).flat();
      const trainRows = trainIdx.map((i) => rows[i]);
      // leakage-safe: encoder fit on the training fold only
      const encoder = buildEncoder(trainRows, req.features);
      const Xtrain = trainRows.map((r) => encoder.encode(r));
      const ytrain = trainIdx.map((i) => y[i]);
      const Xtest = testIdx.map((i) => encoder.encode(rows[i]));
      const ytest = testIdx.map((i) => y[i]);

      const model = fitModel(kind, Xtrain, ytrain, encoder.names);
      const scores = model.predictProba(Xtest);
      aucs.push(rocAuc(ytest, scores));
      const { accuracy, f1 } = accuracyF1(ytest, scores);
      accs.push(accuracy);
      f1s.push(f1);
    }

    // refit on all rows for explanation artifacts
    const fullEncoder = buildEncoder(rows, req.features);
    const fullModel = fitModel(kind, rows.map((r) => fullEncoder.encode(r)), y, fullEncoder.names);

    const mean = (a: number[]) => a.reduce((x, b) => x + b, 0) / a.length;
    const aucMean = mean(aucs);
    const aucStd = Math.sqrt(mean(aucs.map((a) => (a - aucMean) ** 2)));

    results.push({
      model: kind,
      label: MODEL_LABELS[kind],
      auc_mean: Math.round(aucMean * 1000) / 1000,
      auc_std: Math.round(aucStd * 1000) / 1000,
      accuracy: Math.round(mean(accs) * 1000) / 1000,
      f1: Math.round(mean(f1s) * 1000) / 1000,
      fit_ms: Date.now() - t0,
      details: fullModel.details,
    });
  }

  results.sort((a, b) => b.auc_mean - a.auc_mean);

  const encoder = buildEncoder(rows, req.features);
  return {
    n: rows.length,
    positives,
    baseline_rate: Math.round((positives / Math.max(1, rows.length)) * 1000) / 1000,
    folds: k,
    feature_count: req.features.length,
    encoded_dims: encoder.names.length,
    results,
    warnings,
  };
}
