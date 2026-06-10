/**
 * Single source of truth for business metric semantics.
 *
 * The mock dataset has five statuses. `delayed` and `exception` rows DO carry a
 * delivery_date (they were eventually delivered, late / with an incident),
 * while `in_transit` and `canceled` rows do not. Every definition below is
 * surfaced verbatim in the UI explainability panels and the README so the
 * numbers are never ambiguous.
 */
export const BUSINESS_DEFINITIONS = {
  completed:
    "An order with a terminal shipping outcome: status is delivered, delayed or exception. in_transit (still moving) and canceled (void) orders are excluded.",
  on_time:
    "An order with status 'delivered' — it arrived without a recorded delay.",
  late: "A completed order that did not arrive on time: status 'delayed' or 'exception'.",
  on_time_rate:
    "delivered ÷ completed orders (delivered + delayed + exception). Orders still in transit or canceled are excluded because their outcome is unknown or void.",
  delay_rate: "delayed ÷ completed orders, per group.",
  late_rate: "(delayed + exception) ÷ completed orders, per group.",
  cancellation_rate: "canceled ÷ all orders, per group.",
  avg_delivery_days:
    "Mean of (delivery_date − order_date) in days across orders that have a delivery_date (delivered, delayed and exception).",
  median_delivery_days:
    "Median of (delivery_date − order_date) in days across orders that have a delivery_date.",
  p90_delivery_days:
    "90th percentile of delivery time in days — 9 in 10 completed orders arrive at or under this.",
  total_revenue:
    "Sum of order_value_usd (already equals quantity × unit_price; promo discount percentages are informational and not deducted in the source data).",
  total_quantity: "Sum of units (quantity column).",
  demand:
    "Demand for forecasting = total units ordered (sum of quantity) per month, based on order_date.",
  relative_dates:
    "Relative phrases like 'last 3 months' are anchored to the dataset's most recent order date (2025-12-30), not today's calendar date — the mock data covers Jan–Dec 2025.",
} as const;

export type DefinitionKey = keyof typeof BUSINESS_DEFINITIONS;
