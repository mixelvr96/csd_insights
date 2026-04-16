import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { collectTelegramNews } from "../collectors/telegram.js";
import {
  collectClientNews,
  collectCompetitorNews,
  collectIndustryGoogleNews,
} from "../collectors/google-news.js";
import { collectIndustryRss } from "../collectors/industry-rss.js";
import { deduplicateNews } from "../utils/dedup.js";
import { summarizeNews, markReadyItems } from "../ai/summarizer.js";
import { CATEGORIES } from "../config.js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, "").replace(/\s+/g, " ").trim();
}

function isSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size > 0.35;
}

const SECTION_CONFIG: Record<string, { label: string; emoji: string; maxItems: number }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "Новости Zorka", emoji: "🏢", maxItems: 5 },
  [CATEGORIES.INDUSTRY]: { label: "Индустрия", emoji: "📊", maxItems: 5 },
  [CATEGORIES.COMPETITOR]: { label: "Конкуренты клиентов", emoji: "🔍", maxItems: 5 },
  [CATEGORIES.CLIENT]: { label: "Новости клиентов", emoji: "👥", maxItems: 5 },
};

async function main() {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Clean DB
  console.log("=== Cleaning database ===");
  await sb.from("news_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await sb.from("digests").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  console.log("All news items and digests cleared\n");

  // 2. Collect
  console.log("=== Collecting news ===\n");
  await collectTelegramNews();
  await collectIndustryRss();
  await collectIndustryGoogleNews();
  await collectClientNews();
  await collectCompetitorNews();

  // 3. Dedup
  console.log("\n=== Dedup ===");
  await deduplicateNews();

  // Reject old items
  const { data: rejected } = await sb
    .from("news_items")
    .update({ status: "rejected" })
    .eq("status", "raw")
    .lt("published_at", twoWeeksAgo)
    .select("id");
  console.log(`Rejected ${rejected?.length || 0} items older than 2 weeks\n`);

  // 4. AI
  console.log("=== AI Summarization ===\n");
  let batch = 1;
  while (true) {
    console.log(`--- batch ${batch} ---`);
    const processed = await summarizeNews();
    if (processed === 0) break;
    batch++;
  }
  await markReadyItems();

  // 5. Build digest
  console.log("\n=== Building digest ===\n");

  const today = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });
  let md = `# 📰 ZORKA NEWS DIGEST\n**${today}**\n\n`;
  let totalItems = 0;
  const allSelected: { title: string }[] = [];

  for (const [category, cfg] of Object.entries(SECTION_CONFIG)) {
    const { data: candidates } = await sb
      .from("news_items")
      .select("*")
      .eq("category", category)
      .eq("status", "ready")
      .gte("published_at", twoWeeksAgo)
      .order("relevance_score", { ascending: false })
      .limit(cfg.maxItems * 3);

    if (!candidates?.length) continue;

    const items: typeof candidates = [];
    for (const c of candidates) {
      if (items.length >= cfg.maxItems) break;
      const isDup = [...items, ...allSelected].some((ex) => isSimilar(ex.title, c.title));
      if (!isDup) items.push(c);
    }
    if (!items.length) continue;

    allSelected.push(...items);
    totalItems += items.length;

    md += `---\n## ${cfg.emoji} ${cfg.label}\n\n`;

    for (const item of items) {
      md += `**${item.title}**\n`;
      if (item.summary) md += `${item.summary}\n`;
      if ((category === CATEGORIES.INDUSTRY || category === CATEGORIES.COMPETITOR) && item.implication) {
        md += `> 💡 *Что это значит для вас:* ${item.implication}\n`;
      }
      if (item.related_entity) md += `📌 ${item.related_entity}\n`;
      md += `[Источник →](${item.url})\n\n`;
    }
  }

  md += `---\n_Автоматическая сводка от CSD Insights | ${totalItems} новостей_\n`;

  // Save to file
  const outPath = join(__dirname, "../../digest-preview.md");
  writeFileSync(outPath, md, "utf-8");
  console.log(md);
  console.log(`\n✅ Saved to ${outPath}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
