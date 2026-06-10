import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parse the executed research notebook into renderable blocks. */

interface NotebookOutput {
  kind: "text" | "image" | "error";
  text?: string;
  png?: string;
}

interface NotebookCell {
  type: "markdown" | "code";
  source: string;
  execution_count?: number | null;
  outputs?: NotebookOutput[];
}

interface RawOutput {
  output_type: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
}

interface RawCell {
  cell_type: string;
  source: string | string[];
  execution_count?: number | null;
  outputs?: RawOutput[];
}

const joined = (s: string | string[] | undefined): string =>
  Array.isArray(s) ? s.join("") : (s ?? "");

function parseOutputs(outputs: RawOutput[] | undefined): NotebookOutput[] {
  if (!outputs) return [];
  const parsed: NotebookOutput[] = [];
  for (const out of outputs) {
    if (out.output_type === "stream") {
      parsed.push({ kind: "text", text: joined(out.text) });
    } else if (out.output_type === "error") {
      parsed.push({ kind: "error", text: `${out.ename}: ${out.evalue}` });
    } else if (out.data) {
      if (out.data["image/png"]) {
        parsed.push({ kind: "image", png: joined(out.data["image/png"]).replace(/\n/g, "") });
      } else if (out.data["text/plain"]) {
        parsed.push({ kind: "text", text: joined(out.data["text/plain"]) });
      }
    }
  }
  // merge consecutive text outputs
  const merged: NotebookOutput[] = [];
  for (const o of parsed) {
    const last = merged[merged.length - 1];
    if (o.kind === "text" && last?.kind === "text") last.text = `${last.text}\n${o.text}`;
    else merged.push(o);
  }
  return merged;
}

export async function GET() {
  try {
    const file = path.join(process.cwd(), "data", "notebook", "eda_and_delay_model.ipynb");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { cells: RawCell[] };

    const cells: NotebookCell[] = raw.cells.map((c) => ({
      type: c.cell_type === "markdown" ? "markdown" : "code",
      source: joined(c.source),
      execution_count: c.execution_count ?? null,
      outputs: c.cell_type === "code" ? parseOutputs(c.outputs) : undefined,
    }));

    const toc = cells
      .filter((c) => c.type === "markdown")
      .flatMap((c) =>
        c.source
          .split("\n")
          .filter((line) => /^#{1,3} /.test(line))
          .map((line) => line.replace(/^#+ /, "").trim()),
      );

    return Response.json({ cells, toc });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Notebook unavailable" },
      { status: 500 },
    );
  }
}
