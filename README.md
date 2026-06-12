# Spaceship: AI Powered Logistics Analytics

Spaceship is an analytics workspace for a logistics client. It pairs a traditional KPI dashboard with **Atlas**, an AI analyst that interprets natural language questions, routes them through validated analytical tools, and explains every answer with the applied filters, the query plan, the metric definitions, and the underlying data.

**Live demo:** add your deployment URL here

**Stack:** Next.js 16, TypeScript, Supabase, Claude for the agent (Opus 4.8, Opus 4.6, Sonnet 4.6), Gemini for image generation (3 Pro Image, 3.1 Flash Image, 2.5 Flash Image), Recharts, Tailwind CSS v4

**Test credentials:** provided separately to reviewers (not committed to the repository)

## What it covers

* **Descriptive analytics.** A dashboard with five KPIs, five interactive charts, and global filters.
* **Diagnostic analytics.** Natural language questions answered from data, with live agent steps and a visualization canvas.
* **Predictive and prescriptive analytics.** Backtested demand forecasts plus inventory recommendations at a 95 percent service level.
* **Model controls in the status bar.** The footer selects the Claude model that powers the agent and the Gemini model that renders images; the choice persists server side and applies everywhere instantly.
* **Long sessions.** A context usage meter and automatic conversation compaction keep multi turn sessions healthy.
* **ML Lab.** The research notebook rendered block by block, plus in-app model training and benchmarking — six model families with tunable hyperparameters, a performance-vs-interpretability trade-off map, out-of-fold ROC curves, and a decision-threshold explorer with a live confusion matrix — including on a CSV you upload.
* **Reviewer sign-in.** A login gate (credentials configured via environment variables, signed HttpOnly session cookie, enforced by the Next 16 proxy) satisfies the brief's "provide test credentials" clause.
* **Responsive UI.** A light "control tower" visual system with dark mission chrome; every page works down to phone widths.

## 1. Getting started

```bash
cd web
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Environment variables:

* `ANTHROPIC_API_KEY` (required): powers the Claude agent and the compaction summarizer.
* `GEMINI_API_KEY` (required): powers the image generation tool.
* `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (required for persistence): the database for orders, knowledge files, and chat history.
* `REVIEWER_USERNAME` and `REVIEWER_PASSWORD` (required): the reviewer account; the app is fully gated until both are set.
* `ANTHROPIC_MODEL` (optional): default agent model, defaults to `claude-opus-4-8`.
* `AUTH_SECRET` (optional): overrides the demo session-signing secret in production.
* `GEMINI_IMAGE_MODEL` (optional): image model, defaults to `gemini-3-pro-image`.

Verification commands:

```bash
npm test        # 26 unit tests: analytics + forecasting engines, ML engine artifacts
npm run lint    # eslint (passes clean)
npm run build   # production build
```

Sign in with the reviewer credentials provided separately. Every route (pages and APIs except `/api/health` and the auth endpoints) requires the session; signing out is in the header.

The `/api/health` endpoint reports which data drivers are active at any time.

## 2. Supabase setup

The publishable API key cannot run DDL, so creating tables is a one time step:

1. Open the Supabase SQL editor for your project.
2. Run `web/supabase/migrations/0001_init.sql` (orders and knowledge files).
3. Run `web/supabase/migrations/0002_chat_history.sql` (conversations and messages).
4. Run `cd web && npm run seed` to load the 400 orders and the seed knowledge files.

After this, `/api/health` reports `dataset.source: "supabase"` and the chat history panel shows the `supabase` driver. Chat history is stored entirely server side; if the tables are missing the app still works for analysis, the history panel simply explains that persistence is disabled until the migrations run.

### Deploying on Vercel

The Next.js app lives in the `web` subdirectory, so one project setting is essential:

1. In the Vercel project settings, set **Root Directory** to `web`. Without it the build fails immediately because the repository root has no `package.json`.
2. Keep the framework preset on Next.js and the Node.js version on 22.x; install and build commands stay default (`npm install`, `next build`).
3. Add the environment variables for Production and Preview: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `REVIEWER_USERNAME`, `REVIEWER_PASSWORD`, and `AUTH_SECRET` (any long random string; signs the login session).
4. Redeploy. The app degrades gracefully if some variables are missing (the dataset falls back to the bundled CSV and knowledge becomes ephemeral), but the agent itself needs `ANTHROPIC_API_KEY` and image generation needs `GEMINI_API_KEY`.

The serverless bundle ships `web/data` through `outputFileTracingIncludes`, so the CSV fallback, the knowledge seeds, and the notebook all work on Vercel without extra configuration.

## 3. System overview

The expected flow from the brief is implemented literally:

1. The user asks a question in plain language.
2. The model interprets it and selects a tool.
3. The tool input is a structured spec, validated with zod against bounded enums.
4. A deterministic engine computes the result over the dataset.
5. A compact result returns to the model; rich payloads stream to the UI.
6. The model explains the answer; charts and tables render on the canvas.

### Key design decisions

1. **The AI is a router, never the source of truth.** The model cannot emit SQL and cannot do arithmetic on the data. It emits a `QuerySpec`, `ForecastSpec`, or `ChartSpec`; the engine computes everything. Numbers arrive at the model preformatted, and grouped results include exact totals, so the model never sums rows itself.
2. **One engine for both interfaces.** The dashboard calls the same `/api/query` engine the agent uses, so a KPI card and a chat answer can never disagree.
3. **In memory computation over 400 rows.** The dataset is small and read only, so computing in the application layer keeps every number unit testable and identical across Supabase and CSV modes. Supabase remains the system of record once seeded.
4. **Claude thinks, Gemini draws.** The agent loop is implemented over the Anthropic Messages API with tool use (`web/src/lib/agent/loop.ts`); the footer picks which Claude model powers it. Gemini participates only through the `generate_image` tool, with its own model selector in the same status bar. Both choices persist server side (`/api/settings`) so they survive reloads and apply to every client.
5. **Stateless agent API, durable conversations.** Each turn sends the prior plain text turns after the compaction boundary, plus an optional summary. Conversations and messages persist in Supabase through full CRUD endpoints, and each conversation lives at `/chat/{id}`.
6. **Demo authentication, real enforcement.** One reviewer account configured through environment variables (the data is mock, so a user table would be theater) — but the enforcement path is production-shaped: an HMAC-signed expiring session cookie (HttpOnly, SameSite=Lax) issued by `/api/auth/login` and verified in `src/proxy.ts` (Next 16's middleware successor) for every page and API route, with `?next=` deep-link redirects.
7. **Compaction for long sessions.** The context bar tracks the real prompt size of the last model call. At 24k tokens the conversation compacts automatically: `claude-haiku-4-5` merges earlier turns into a structured briefing (goals, exact figures, preferences, open threads) that is injected ahead of the visible history. The boundary and the summary stay inspectable in the transcript.

## 4. The AI approach

### How questions are interpreted

The system prompt (`web/src/lib/agent/system-prompt.ts`) follows the published context engineering guidance:

* **Right altitude.** A compact data dictionary, canonical metric definitions, and heuristics rather than brittle rules, plus three worked examples mapping a question to a tool plan.
* **Stable prefix for prompt caching.** The prompt derives only from the static dataset, so the bytes stay identical across requests and the system plus tools prefix caches.
* **Just in time context.** The prompt lists knowledge files by name and preview only; the agent reads full files through tools when relevant.
* **Date anchoring.** Relative phrases such as "last 3 months" resolve against the most recent order date in the data (December 30, 2025), and the agent states the resolved window in answers.

### Tool selection

Eight small composable tools, each with a prescriptive "call this when" description:

* `query_orders`: every count, rate, ranking, or trend; returns rows plus a result id, the plan, and the applied filters.
* `forecast_demand`: predictions and inventory planning; renders its own visualization. This is the ML the agent uses for predictions, with the method chosen by backtest.
* `evaluate_ml_models`: trains and benchmarks the late delivery classifiers live with leakage safe cross validation when asked whether ML can predict delays, and reports the honest verdict with a comparison chart.
* `create_chart`: renders a chart from a result produced earlier in the turn; the agent picks the chart type.
* `generate_image`: Gemini visual assets such as report covers, never data charts.
* `knowledge_list`, `knowledge_read`, `knowledge_write`: the agent's evolving markdown memory.

The loop streams text and thinking deltas live, executes tool calls in parallel within a turn, feeds validation errors back so the model can self correct, and stops after eight iterations.

### Explainability

Every `query_orders` step in the chat carries the structured input (rendered as readable labels, with raw JSON one click away), the query plan, the applied filters, the metric definitions including the denominator note, the aggregated result table, and a sample of the matching raw orders. Forecasts include the method, the backtest scores for every candidate method, an uncertainty band, and the full methodology text.

### The knowledge filesystem

Seed files (`data-dictionary.md`, `analyst-playbook.md`, `insights.md`, `user-preferences.md`) live in the repository and are loaded into the knowledge store on first use. The agent appends durable findings and stated user preferences as it works, and the Knowledge page lets humans audit and edit that memory. Storage resolves to Supabase, then the local filesystem in development, then memory.

## 5. Forecasting

Monthly series per category, region, carrier, warehouse, or the whole network feed three candidate methods: moving average, linear regression, and exponential smoothing. The `auto` mode holds out the final three months, scores each method by MAE, and picks the winner; the backtest table is shown in the UI. The uncertainty band is about 80 percent, derived from one step ahead residuals. The inventory recommendation adds safety stock at a 95 percent service level, per month and in total.

**The SKU trap.** 355 of the 400 orders carry unique SKUs, at most 3 orders each, so a per SKU forecast would be statistical theater. SKU requests fall back automatically to the product category encoded in the SKU prefix, and the result says so explicitly.

## 6. ML Lab, and why no prediction tool shipped

The research notebook (`ml/eda_and_delay_model.ipynb`, executed outputs included) studies a late delivery classifier with preregistered ship criteria: mean cross validated ROC AUC at or above 0.65 and a permutation test p value under 0.05, on leakage safe features only.

Result: logistic regression reached **AUC 0.465**, worse than chance, with permutation **p = 0.68**. The carrier level differences visible in exploration are small sample noise. The decision, recorded in `ml/model/DECISION.md`, was **not to ship** a prediction tool to the agent. A confidently wrong risk score is worse than none.

The agent still engages with this ML honestly. Ask it whether machine learning can predict late deliveries and it calls `evaluate_ml_models`, which trains the same classifiers live with leakage safe cross validation, charts the comparison, and explains why per order risk scores stay unshipped. Forecasting is the ML the agent does use for predictions, because it passes its backtest.

The ML Lab page makes that study a product surface:

* **Research notebook tab.** The executed notebook parsed server side and rendered block by block: markdown, collapsible code cells, stdout, and matplotlib plots, with a clickable table of contents.
* **Train and benchmark tab.** A dependency-free TypeScript ML engine (`web/src/lib/ml/engine.ts`) trains six model families — prior baseline, logistic regression, Gaussian naive Bayes, a CART decision tree, a random forest (bootstrap bagging, √d feature subspaces), and kNN — with stratified cross-validation and rank-based ROC-AUC. Encoders are fit on training folds only. Hyperparameters are tunable per model (L2/epochs, tree depth and leaf size, forest size and depth, k), and you can train on the bundled dataset or upload your own CSV, pick the target column and positive class, toggle features, and flip column types inline.
* **Trade-offs made visible, Dataiku-style.** Results return as a ranked leaderboard (with an interpretability gauge per family), a performance-vs-interpretability trade-off map (bubble size = fit time), overlaid out-of-fold ROC curves against the chance diagonal, and a decision-threshold explorer whose confusion matrix and precision/recall/F1 are computed from pooled out-of-fold predictions — generalization, not training fit. A verdict is judged against the notebook's preregistered bar. On the bundled data the TypeScript engine independently reproduces the sklearn conclusion: no deployable signal.

## 7. Data correctness

Canonical definitions live in one module, are enforced by one engine, surfaced in the UI, and verified by 19 unit tests against ground truths computed independently of the engine:

* 400 orders from January 1, 2025 to December 30, 2025.
* Status counts: delivered 304, delayed 55, in transit 27, exception 11, canceled 3.
* On time rate: delivered divided by completed equals 304/370, which is **82.2 percent**.
* Average delivery time: 1417 days over 370 completed orders, which is **3.83 days**.
* Revenue: order value equals quantity times unit price on every row, totaling **$13,695.87**.

Covered edge cases include quoted CSV fields such as "London, UK", ISO week boundaries at the year change, empty time buckets filled with zeros so trend charts never lie, and relative windows resolved against the dataset's latest date.

## 8. Assumptions and simplifications

* **On time means status delivered.** Delayed and exception rows carry a delivery date, meaning they arrived late or with an incident. Rates use completed orders (delivered plus delayed plus exception) as the denominator; in transit and canceled orders are excluded. The UI states this wherever the metric appears.
* **Relative dates anchor to the dataset.** "Last 3 months" resolves against December 30, 2025, otherwise such questions would return empty results. Every answer states the resolved range.
* Order id prefixes mention 2026 while the order dates are in 2025; the order date is treated as authoritative.
* Promo discount percentages are informational; order value equals quantity times unit price exactly in the source data.
* Demand for forecasting means units ordered per month by order date.
* The demo tables use open RLS policies because the data is mock and contains no personal information; the migration files document how to lock inserts after seeding.

## 9. Limitations and unsupported queries

* Questions outside the 17 columns (costs, SLAs, customer names, weather, and so on), cross dataset joins, and computed metrics beyond the 21 built in ones are unsupported; the agent says so rather than improvising.
* Chat history requires the Supabase migrations; without them analysis works but conversations are not persisted.
* Generated images are kept in the session and are not written into stored history, to keep message rows small.
* The result registry used by `create_chart` is per turn; the agent re queries cheaply when it needs to chart older results.
* Compaction summaries are deliberately lossy; exact tool tables from compacted turns are dropped and re queried on demand.
* Authentication is a single shared reviewer account by design; per-user scoping of conversations and knowledge is listed under future improvements.

## 10. Future improvements

1. Programmatic tool calling to compose query and chart steps in one scripted container step, cutting loop latency and tokens.
2. Per-user accounts (the gate exists; what remains is scoping conversations and knowledge per user).
3. Result caching keyed by spec hash plus dataset version, and SSE resume on reconnect.
4. Richer forecasting once real data exists: seasonality, per warehouse lead times, service level optimization against holding cost.
5. An evaluation harness replaying golden question to spec pairs in CI to catch interpretation regressions.
6. Scheduled anomaly scans that append findings to `insights.md`, turning the knowledge base into a proactive briefing.

## 11. Testing

* **Unit tests:** `cd web && npm test` covers engine KPIs against independent ground truths, filtering, grouping, sorting, relative windows, ISO weeks, bucket filling, forecast backtesting, SKU fallback, CSV quoting, and the ML engine (new model families recover a planted signal, deterministic forests, hyperparameter plumbing, ROC monotonicity, threshold-sweep confusion counts).
* **End to end:** the app was driven through Chrome DevTools at desktop and phone viewports: the login flow (valid + invalid credentials, deep-link redirect), dashboard numbers against ground truth, the three example questions from the brief, multi-turn context, compaction, canvas behavior, image generation, knowledge writes, ML Lab training including hyperparameters and CSV upload, and notebook rendering.

## 12. AI usage disclosure

This project was built with Claude Code from Anthropic as the primary engineering tool, covering architecture, implementation, tests, and this README, directed and reviewed by the author. Runtime AI: Anthropic Claude for the agent and the compaction summarizer, Google Gemini for image generation.

## 13. Repository layout

```
web/                      Next.js application
  src/lib/                engines (analytics, forecast, ml) and the agent harness
  src/app/                routes, pages, API endpoints
  data/                   bundled dataset, knowledge seeds, executed notebook
  supabase/migrations/    0001_init.sql, 0002_chat_history.sql
  scripts/seed.ts         loads orders and knowledge into Supabase
  tests/                  vitest unit tests
ml/                       research notebook source and the ship or no ship decision
```
