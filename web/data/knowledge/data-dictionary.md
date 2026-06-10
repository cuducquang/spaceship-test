# Data dictionary — logistics orders

One unified dataset: **400 orders, 2025-01-01 → 2025-12-30** (the mock data lives entirely in 2025).

## Columns

| column | meaning | notes |
|---|---|---|
| order_id | unique order id | prefix says "ORD-2026-…" but order_date is authoritative (known mock-data quirk — ignore the prefix year) |
| client_id | customer (30 distinct, CL-1001…CL-1030) | |
| order_date | date the order was placed | use this for all time analysis |
| delivery_date | date delivered | null for `in_transit` and `canceled` |
| carrier | shipping carrier (9): FedEx, UPS, DHL, USPS, OnTrac, LaserShip, Royal Mail, DPD, GLS | |
| origin_city / warehouse | 1:1 mapping, 9 warehouses: LON-FC1, EWR-DC1, SFO-DC2, LAX-DC1, ATL-DC1, AMS-FC1, DFW-DC1, BER-FC1, CHI-DC1 | |
| destination_city | 47 distinct cities | |
| status | delivered (304) · delayed (55) · in_transit (27) · exception (11) · canceled (3) | `delayed`/`exception` DO have a delivery_date — they arrived late / with an incident |
| sku | product id like CRAYON-0017 | **355 distinct SKUs in 400 orders — most appear exactly once.** Never forecast a single SKU; use its category |
| product_category | 8: CRAYON, STICKER, MARKER, PAINT, BRUSH, PENCIL, PAPER, BOOK | SKU prefix = category |
| quantity, unit_price_usd, order_value_usd | order_value = quantity × unit_price (verified exact) | |
| is_promo, promo_discount_pct | 22 promo orders, discounts 5–34% | discount is informational, not deducted from order_value |
| region | US-E, US-W, US-C, EU, UK | |

## Business definitions (canonical)

- **completed** = delivered + delayed + exception (370 orders). in_transit/canceled excluded.
- **on-time** = status `delivered`. **late** = delayed or exception.
- **on-time rate** = delivered ÷ completed.
- **avg delivery days** over rows with a delivery_date.
- **demand** (forecasting) = units (quantity) per month by order_date.
- Relative dates ("last 3 months") anchor to the dataset max date **2025-12-30**, not today.
