import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { summarizeNews, markReadyItems } from "../ai/summarizer.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Cutoff: ${twoWeeksAgo.slice(0, 10)}\n`);

  // Reject all items older than 2 weeks that are still raw
  const { data: rejected } = await sb
    .from("news_items")
    .update({ status: "rejected" })
    .eq("status", "raw")
    .lt("published_at", twoWeeksAgo)
    .select("id");
  console.log(`Rejected ${rejected?.length || 0} old items (before 2 weeks)`);

  // Also reject already-ready items that are older than 2 weeks
  const { data: rejectedReady } = await sb
    .from("news_items")
    .update({ status: "rejected" })
    .in("status", ["ready", "processed"])
    .lt("published_at", twoWeeksAgo)
    .select("id");
  console.log(`Rejected ${rejectedReady?.length || 0} old ready/processed items`);

  // Check how many raw items remain (within 2 weeks)
  const { count } = await sb
    .from("news_items")
    .select("*", { count: "exact", head: true })
    .eq("status", "raw");
  console.log(`\n${count} raw items remaining to process\n`);

  // Process remaining raw items through AI (in batches of 50)
  let batch = 1;
  while (true) {
    console.log(`--- AI batch ${batch} ---`);
    const processed = await summarizeNews();
    if (processed === 0) break;
    batch++;
  }

  await markReadyItems();

  // Final stats
  const { data: ready } = await sb
    .from("news_items")
    .select("category")
    .eq("status", "ready");

  console.log(`\n=== Ready for digest ===`);
  const cats = ["zorka_agency", "industry", "competitor", "client"];
  for (const cat of cats) {
    const count = ready?.filter((r) => r.category === cat).length || 0;
    console.log(`  ${cat}: ${count}`);
  }
  console.log(`  Total: ${ready?.length || 0}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
