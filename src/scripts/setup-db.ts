import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, "../db/schema.sql"), "utf-8");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set in .env");
  process.exit(1);
}

// Try multiple host formats for Supabase
const urls = [
  DATABASE_URL,
  DATABASE_URL.replace(
    /db\.(\w+)\.supabase\.co/,
    "aws-0-eu-central-1.pooler.supabase.com"
  ).replace("postgres:", "postgres.chbnbpfijfbpykboldre:"),
  DATABASE_URL.replace(
    /db\.(\w+)\.supabase\.co/,
    "aws-0-eu-west-1.pooler.supabase.com"
  ).replace("postgres:", "postgres.chbnbpfijfbpykboldre:"),
  DATABASE_URL.replace(
    /db\.(\w+)\.supabase\.co/,
    "aws-0-us-east-1.pooler.supabase.com"
  ).replace("postgres:", "postgres.chbnbpfijfbpykboldre:"),
];

async function tryConnect(url: string): Promise<boolean> {
  const display = url.replace(/:[^:@]+@/, ":***@");
  console.log(`Trying: ${display}`);
  const pg = postgres(url, { connect_timeout: 10 });
  try {
    await pg`SELECT 1 as test`;
    console.log("Connected!\n");

    console.log("Executing schema...");
    await pg.unsafe(sql);
    console.log("\n✓ All tables and indexes created successfully!");

    await pg.end();
    return true;
  } catch (err: any) {
    console.log(`  Failed: ${err.message}\n`);
    await pg.end();
    return false;
  }
}

async function main() {
  for (const url of urls) {
    const ok = await tryConnect(url);
    if (ok) return;
  }
  console.error("Could not connect with any URL format.");
  console.error("Please check DATABASE_URL in .env");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
