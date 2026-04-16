import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { collectTelegramNews } from "../collectors/telegram.js";
import {
  collectClientNews,
  collectCompetitorNews,
  collectIndustryGoogleNews,
  collectResearchNews,
  collectVerticalNews,
} from "../collectors/google-news.js";
import { collectIndustryRss } from "../collectors/industry-rss.js";
import { collectResearchRss } from "../collectors/research-rss.js";
import { deduplicateNews } from "../utils/dedup.js";
import { summarizeNews, markReadyItems } from "../ai/summarizer.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Clean
  console.log("=== Cleaning database ===");
  await sb.from("news_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("digests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("Done\n");

  // 2. Collect
  console.log("=== Collecting ===\n");
  await collectTelegramNews();
  await collectIndustryRss();
  await collectResearchRss();
  await collectIndustryGoogleNews();
  await collectResearchNews();
  await collectVerticalNews();
  await collectClientNews();
  await collectCompetitorNews();

  // 3. Dedup + reject old
  console.log("\n=== Dedup ===");
  await deduplicateNews();
  await sb.from("news_items").update({ status: "rejected" }).eq("status", "raw").lt("published_at", twoWeeksAgo);

  // 4. AI
  console.log("\n=== AI ===\n");
  let batch = 1;
  while (true) {
    console.log(`batch ${batch}...`);
    const n = await summarizeNews();
    if (n === 0) break;
    batch++;
  }
  await markReadyItems();

  // 5. Generate PPTX
  console.log("\n=== Generating PPTX ===\n");
  // Dynamic import to keep this script lean
  await import("./generate-pptx.js");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
