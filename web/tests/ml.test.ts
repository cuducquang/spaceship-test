import { describe, expect, it } from "vitest";
import { rocCurve, runBenchmark, thresholdSweep, type Row } from "@/lib/ml/engine";

/**
 * Synthetic dataset with a planted signal: y = late when (x > 0.6) XOR-free
 * linear rule with noise, plus a categorical that correlates with the label.
 * Real models must clearly beat the prior baseline on it.
 */
function syntheticRows(n = 240): Row[] {
  // deterministic LCG so tests never flake
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648), s / 2147483648);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const x = rnd();
    const group = rnd() < 0.5 ? "north" : "south";
    const signal = x * 1.6 + (group === "north" ? 0.45 : 0) + (rnd() - 0.5) * 0.5;
    rows.push({
      x: Math.round(x * 100) / 100,
      group,
      noise: Math.round(rnd() * 100) / 100,
      outcome: signal > 1.1 ? "late" : "on_time",
    });
  }
  return rows;
}

const REQUEST = {
  rows: syntheticRows(),
  target: "outcome",
  positive: "late",
  features: [
    { name: "x", kind: "numeric" as const },
    { name: "group", kind: "categorical" as const },
    { name: "noise", kind: "numeric" as const },
  ],
  folds: 5,
};

describe("new model families", () => {
  it("naive bayes and random forest find the planted signal (AUC ≫ 0.5)", () => {
    const bench = runBenchmark({ ...REQUEST, models: ["dummy", "nb", "forest"] });
    const byModel = Object.fromEntries(bench.results.map((r) => [r.model, r]));
    expect(byModel.nb.auc_mean).toBeGreaterThan(0.8);
    expect(byModel.forest.auc_mean).toBeGreaterThan(0.8);
    expect(Math.abs(byModel.dummy.auc_mean - 0.5)).toBeLessThan(0.05);
  });

  it("is deterministic across runs", () => {
    const a = runBenchmark({ ...REQUEST, models: ["forest"] });
    const b = runBenchmark({ ...REQUEST, models: ["forest"] });
    expect(a.results[0].auc_mean).toBe(b.results[0].auc_mean);
    expect(a.results[0].roc).toEqual(b.results[0].roc);
  });

  it("plumbs hyperparameters through (deeper forest ≠ stump forest)", () => {
    const stumps = runBenchmark({
      ...REQUEST,
      models: ["forest"],
      params: { forest: { trees: 15, max_depth: 1 } },
    });
    const deep = runBenchmark({
      ...REQUEST,
      models: ["forest"],
      params: { forest: { trees: 15, max_depth: 6 } },
    });
    expect(stumps.results[0].auc_mean).not.toBe(deep.results[0].auc_mean);
  });

  it("reports trade-off traits on every result", () => {
    const bench = runBenchmark({ ...REQUEST, models: ["logreg", "knn"] });
    for (const r of bench.results) {
      expect(r.traits.interpretability).toBeGreaterThanOrEqual(1);
      expect(r.traits.interpretability).toBeLessThanOrEqual(5);
      expect(r.traits.family).toBeTruthy();
    }
  });
});

describe("out-of-fold artifacts", () => {
  it("rocCurve starts at (0,0), ends at (1,1), and is monotonic", () => {
    const y = [1, 0, 1, 0, 1, 0, 1, 0];
    const s = [0.9, 0.8, 0.7, 0.3, 0.6, 0.2, 0.5, 0.1];
    const curve = rocCurve(y, s);
    expect(curve[0]).toEqual({ fpr: 0, tpr: 0 });
    expect(curve[curve.length - 1]).toEqual({ fpr: 1, tpr: 1 });
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].fpr).toBeGreaterThanOrEqual(curve[i - 1].fpr);
      expect(curve[i].tpr).toBeGreaterThanOrEqual(curve[i - 1].tpr);
    }
  });

  it("thresholdSweep: threshold 0 predicts everything positive, 1 nearly nothing", () => {
    const y = [1, 1, 0, 0];
    const s = [0.8, 0.6, 0.4, 0.2];
    const sweep = thresholdSweep(y, s);
    const at0 = sweep.find((p) => p.threshold === 0)!;
    expect(at0.tp).toBe(2);
    expect(at0.fp).toBe(2);
    expect(at0.recall).toBe(1);
    const at1 = sweep.find((p) => p.threshold === 1)!;
    expect(at1.tp + at1.fp).toBe(0);
  });

  it("benchmark attaches roc + thresholds per model", () => {
    const bench = runBenchmark({ ...REQUEST, models: ["logreg"] });
    const r = bench.results[0];
    expect(r.roc!.length).toBeGreaterThan(5);
    expect(r.thresholds!.length).toBe(21);
    // the 0.5-threshold sweep entry should match the reported headline metrics
    // loosely (sweep is pooled OOF; headline is fold-averaged) — sanity only
    const mid = r.thresholds!.find((p) => p.threshold === 0.5)!;
    expect(Math.abs(mid.accuracy - r.accuracy)).toBeLessThan(0.1);
  });
});
