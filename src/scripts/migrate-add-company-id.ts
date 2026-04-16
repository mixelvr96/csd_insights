import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  // Check if column exists
  const { error } = await sb.from("clients").select("hubspot_company_id").limit(1);
  if (!error) {
    console.log("Column hubspot_company_id already exists");
    return;
  }
  console.log("Adding hubspot_company_id column...");

  // Supabase doesn't expose raw SQL via client — use pg directly
  const { Pool } = await import("pg");
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  await pool.query("ALTER TABLE clients ADD COLUMN IF NOT EXISTS hubspot_company_id TEXT;");
  await pool.end();
  console.log("Done");
}

run().catch(console.error);
