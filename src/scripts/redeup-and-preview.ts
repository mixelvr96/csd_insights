import "dotenv/config";
import { deduplicateNews } from "../utils/dedup.js";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "../config.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const SECTION_CONFIG: Record<string, { label: string; emoji: string; maxItems: number }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "Новости Zorka", emoji: "🏢", maxItems: 5 },
  [CATEGORIES.INDUSTRY]: { label: "Индустрия", emoji: "📊", maxItems: 5 },
  [CATEGORIES.COMPETITOR]: { label: "Конкуренты клиентов", emoji: "🔍", maxItems: 5 },
  [CATEGORIES.CLIENT]: { label: "Новости клиентов", emoji: "👥", maxItems: 5 },
};

async function main() {
  console.log("Running deduplication on ready items...\n");
  const deduped = await deduplicateNews();
  console.log();

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let md = `# 📰 ZORKA NEWS DIGEST\n`;
  md += `**${today}**\n\n`;
  let totalItems = 0;

  for (const [category, cfg] of Object.entries(SECTION_CONFIG)) {
    const { data: items } = await sb
      .from("news_items")
      .select("*")
      .eq("category", category)
      .eq("status", "ready")
      .gte("published_at", twoWeeksAgo)
      .order("relevance_score", { ascending: false })
      .limit(cfg.maxItems);

    if (!items?.length) continue;
    totalItems += items.length;

    md += `---\n## ${cfg.emoji} ${cfg.label}\n\n`;

    for (const item of items) {
      md += `**${item.title}**\n`;
      if (item.summary) md += `${item.summary}\n`;
      if (
        (category === CATEGORIES.INDUSTRY || category === CATEGORIES.COMPETITOR) &&
        item.implication
      ) {
        md += `> 💡 *Что это значит для вас:* ${item.implication}\n`;
      }
      if (item.related_entity) md += `📌 ${item.related_entity}\n`;
      md += `[Источник →](${item.url})\n\n`;
    }
  }

  md += `---\n_Автоматическая сводка от CSD Insights | ${totalItems} новостей_\n`;
  console.log(md);
}

main().then(() => process.exit(0)).catch(console.error);
