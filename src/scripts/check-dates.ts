import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: stats } = await sb
    .from("news_items")
    .select("category, status, published_at")
    .order("published_at", { ascending: false });

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const within2w = stats!.filter((s) => s.published_at && s.published_at >= twoWeeksAgo).length;
  const older = stats!.filter((s) => s.published_at && s.published_at < twoWeeksAgo).length;
  const noDate = stats!.filter((s) => !s.published_at).length;

  console.log("Total items:", stats!.length);
  console.log("Within last 2 weeks:", within2w);
  console.log("Older than 2 weeks:", older);
  console.log("No published_at:", noDate);
  console.log("Cutoff date:", twoWeeksAgo.slice(0, 10));
  console.log();

  const cats = ["zorka_agency", "industry", "competitor", "client"] as const;
  for (const cat of cats) {
    const all = stats!.filter((s) => s.category === cat);
    const recent = all.filter((s) => !s.published_at || s.published_at >= twoWeeksAgo);
    const ready = all.filter((s) => s.status === "ready");
    console.log(`${cat}: ${all.length} total, ${recent.length} within 2w, ${ready.length} ready`);
  }
}

main().catch(console.error);
