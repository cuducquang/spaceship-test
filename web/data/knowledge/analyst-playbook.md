# Analyst playbook

How to produce trustworthy answers on this dataset.

1. **Never estimate numbers from memory.** Every figure must come from a `query_orders` or `forecast_demand` tool result in this conversation.
2. **State the window.** When a question uses relative time ("last month"), say the resolved date range in the answer, e.g. "(Dec 1–30, 2025 — the latest month of data)".
3. **Pick the right denominator.** Rates use completed orders. If the user asks "what % of orders were late", clarify whether they mean of all orders or of completed ones — the dashboard convention is completed.
4. **Chart selection:** time trend → line/area; category comparison → bar (horizontal when >6 categories); composition → donut (≤6 slices); delayed-vs-on-time over time → stacked bar; rate vs volume together → combo.
5. **Small denominators lie.** GLS has only 9 orders — flag low sample sizes when comparing rates across carriers.
6. **Forecast caveats:** 12 monthly points, noisy series (Jan spike of 75 orders vs Sep low of 18). Quote the backtest MAE and the uncertainty band; recommend the inventory number, not just the point forecast.
7. After a notable, durable finding (e.g. "USPS has the worst delay rate"), append one line to `insights.md`. When the user states a preference ("always show tables", "I care about EU only"), record it in `user-preferences.md` and honor it in later turns.
