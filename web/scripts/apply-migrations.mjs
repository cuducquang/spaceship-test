/**
 * Applies every SQL file in supabase/migrations, in order, over a direct
 * Postgres connection. Reads SUPABASE_DB_URL from the environment or
 * .env.local. Usage: npm run db:push
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// minimal .env.local loader (no dependency on dotenv for this script)
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres)");
  process.exit(1);
}

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const who = await client.query("select current_user, current_database()");
  console.log(`connected as ${who.rows[0].current_user} to ${who.rows[0].current_database}`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    await client.query(sql);
    console.log("ok");
  }
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
  );
  console.log(`public tables: ${tables.rows.map((r) => r.table_name).join(", ")}`);
} finally {
  await client.end();
}
