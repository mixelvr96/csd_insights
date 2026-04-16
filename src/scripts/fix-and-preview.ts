import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "../config.js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function cleanTitle(title: string): string {
  // Strip leading emoji sequences
  let clean = title.replace(/^[\s\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}❤💚💛💜🖤🤍🤎🧡💙🩵🩶🩷♥️☺️✨⭐🌟💫✅❌⚡🔥💪👆👇👉👈🎯🎉🎊🏆💰📢📣🔔💎🎮🎬📱💻🖥️📊📈📉🔗🔐🔑💡📌📎✏️📝🗓️⏰🕐⏳❗❓‼️⁉️]+/gu, "").trim();
  // If cleanup removed too much, use raw
  if (clean.length < 10) return title.substring(0, 150);
  return clean.substring(0, 150);
}

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
  return intersection.length / union.size > 0.5;
}

const SECTION_CONFIG: Record<string, { label: string; emoji: string; maxItems: number }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "Новости Zorka", emoji: "🏢", maxItems: 5 },
  [CATEGORIES.INDUSTRY]: { label: "Индустрия", emoji: "📊", maxItems: 5 },
  [CATEGORIES.COMPETITOR]: { label: "Конкуренты клиентов", emoji: "🔍", maxItems: 5 },
  [CATEGORIES.CLIENT]: { label: "Новости клиентов", emoji: "👥", maxItems: 5 },
};

async function main() {
  // 1. Fix Telegram titles in DB
  const { data: tgItems } = await sb
    .from("news_items")
    .select("id, title")
    .eq("source_name", "telegram");

  if (tgItems?.length) {
    for (const item of tgItems) {
      const cleaned = cleanTitle(item.title);
      if (cleaned !== item.title) {
        await sb.from("news_items").update({ title: cleaned }).eq("id", item.id);
      }
    }
    console.log(`Fixed ${tgItems.length} Telegram titles\n`);
  }

  // 2. Build preview with cross-section dedup
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
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
  console.log(md);
}

main().then(() => process.exit(0)).catch(console.error);
