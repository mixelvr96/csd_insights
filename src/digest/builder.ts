import { CATEGORIES, type Category } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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

export interface DigestSection {
  category: Category;
  label: string;
  emoji: string;
  items: NewsItem[];
}

export interface DigestData {
  digestId: string;
  date: string;
  sections: DigestSection[];
  totalItems: number;
}

const SECTION_CONFIG: Record<string, { label: string; emoji: string; maxItems: number }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "Новости Зорки", emoji: "🏢", maxItems: 3 },
  [CATEGORIES.INDUSTRY]: { label: "Индустрия", emoji: "📊", maxItems: 5 },
  [CATEGORIES.RESEARCH]: { label: "Исследования рынка", emoji: "📈", maxItems: 3 },
  [CATEGORIES.VERTICAL]: { label: "Новости по вертикалям клиентов", emoji: "🏭", maxItems: 5 },
  [CATEGORIES.CLIENT]: { label: "Новости клиентов", emoji: "👥", maxItems: 5 },
  [CATEGORIES.COMPETITOR]: { label: "Конкуренты клиентов", emoji: "🔍", maxItems: 5 },
};

export async function buildDigest(): Promise<DigestData | null> {
  // Create a digest record
  const { data: digest, error: digestError } = await supabase
    .from("digests")
    .insert({ status: "draft", item_count: 0 })
    .select("id")
    .single();

  if (digestError || !digest) {
    console.error("Failed to create digest record:", digestError);
    return null;
  }

  const sections: DigestSection[] = [];
  const allSelectedItems: NewsItem[] = [];
  let totalItems = 0;

  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  for (const [category, cfg] of Object.entries(SECTION_CONFIG)) {
    // Fetch more than needed so we can filter duplicates across sections
    const { data: candidates, error } = await supabase
      .from("news_items")
      .select("*")
      .eq("category", category)
      .eq("status", "ready")
      .gte("published_at", twoWeeksAgo)
      .order("relevance_score", { ascending: false })
      .limit(cfg.maxItems * 3);

    if (error || !candidates?.length) continue;

    // Deduplicate within section + across already-selected items
    const items: NewsItem[] = [];
    for (const candidate of candidates) {
      if (items.length >= cfg.maxItems) break;
      const isDuplicate = [...items, ...allSelectedItems].some((existing) =>
        isSimilar(existing.title, candidate.title)
      );
      if (!isDuplicate) items.push(candidate);
    }

    if (!items.length) continue;

    allSelectedItems.push(...items);

    // Mark items as part of this digest
    const ids = items.map((i) => i.id);
    await supabase
      .from("news_items")
      .update({ digest_id: digest.id, status: "sent" })
      .in("id", ids);

    sections.push({
      category: category as Category,
      label: cfg.label,
      emoji: cfg.emoji,
      items,
    });

    totalItems += items.length;
  }

  if (totalItems === 0) {
    // Clean up empty digest
    await supabase.from("digests").delete().eq("id", digest.id);
    console.log("No items ready for digest");
    return null;
  }

  // Update digest count
  await supabase
    .from("digests")
    .update({ item_count: totalItems })
    .eq("id", digest.id);

  const today = new Date().toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    digestId: digest.id,
    date: today,
    sections,
    totalItems,
  };
}
