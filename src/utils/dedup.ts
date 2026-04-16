import { supabase } from "../db/supabase.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size; // Jaccard similarity
}

export async function deduplicateNews(): Promise<number> {
  // Fetch all non-duplicate, non-rejected items to compare against each other
  const { data: allItems, error } = await supabase
    .from("news_items")
    .select("id, title, url, status, relevance_score, collected_at")
    .not("status", "in", '("duplicate","rejected")')
    .order("collected_at", { ascending: true });

  if (error || !allItems?.length) return 0;

  const duplicateIds: string[] = [];
  const seen: { id: string; title: string; url: string }[] = [];

  for (const item of allItems) {
    const isDuplicate = seen.some((ex) => {
      if (ex.url === item.url) return true;
      return similarity(ex.title, item.title) > 0.6;
    });

    if (isDuplicate) {
      duplicateIds.push(item.id);
    } else {
      seen.push({ id: item.id, title: item.title, url: item.url });
    }
  }

  if (duplicateIds.length > 0) {
    // Process in batches to avoid Supabase query limits
    for (let i = 0; i < duplicateIds.length; i += 100) {
      const batch = duplicateIds.slice(i, i + 100);
      await supabase
        .from("news_items")
        .update({ status: "duplicate" })
        .in("id", batch);
    }
  }

  console.log(`Dedup: marked ${duplicateIds.length} items as duplicates`);
  return duplicateIds.length;
}
