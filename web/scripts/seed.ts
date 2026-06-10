/**
 * Seed the Supabase `orders` and `knowledge_files` tables.
 *
 * Prerequisite: run supabase/migrations/0001_init.sql in the Supabase SQL
 * editor first (the publishable key cannot create tables).
 *
 * Usage: npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseCsvObjects } from "../src/lib/data/csv";

config({ path: path.join(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / key env vars. See .env.example.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function seedOrders() {
  const csv = fs.readFileSync(path.join(process.cwd(), "data", "mock_logistics_data.csv"), "utf8");
  const records = parseCsvObjects(csv).map((r) => ({
    order_id: r.order_id,
    client_id: r.client_id,
    order_date: r.order_date,
    delivery_date: r.delivery_date || null,
    carrier: r.carrier,
    origin_city: r.origin_city,
    destination_city: r.destination_city,
    status: r.status,
    sku: r.sku,
    product_category: r.product_category,
    quantity: Number(r.quantity),
    unit_price_usd: Number(r.unit_price_usd),
    order_value_usd: Number(r.order_value_usd),
    is_promo: r.is_promo === "1",
    promo_discount_pct: Number(r.promo_discount_pct || 0),
    region: r.region,
    warehouse: r.warehouse,
  }));

  console.log(`Upserting ${records.length} orders…`);
  for (let i = 0; i < records.length; i += 200) {
    const batch = records.slice(i, i + 200);
    const { error } = await supabase.from("orders").upsert(batch, { onConflict: "order_id" });
    if (error) throw new Error(`orders batch ${i / 200 + 1}: ${error.message}`);
    process.stdout.write(`  …${Math.min(i + 200, records.length)}/${records.length}\r\n`);
  }
}

async function seedKnowledge() {
  const dir = path.join(process.cwd(), "data", "knowledge");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  console.log(`Upserting ${files.length} knowledge files…`);
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), "utf8");
    const { error } = await supabase
      .from("knowledge_files")
      .upsert({ path: f, content, updated_at: new Date().toISOString() }, { onConflict: "path" });
    if (error) throw new Error(`knowledge ${f}: ${error.message}`);
    console.log(`  ✓ ${f}`);
  }
}

async function main() {
  await seedOrders();
  await seedKnowledge();
  const { count, error } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  console.log(`\nDone. Supabase now holds ${count} orders.`);
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  console.error(
    "Did you run supabase/migrations/0001_init.sql in the Supabase SQL editor first?",
  );
  process.exit(1);
});
