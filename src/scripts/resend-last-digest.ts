import "dotenv/config";
import { CATEGORIES } from "../config.js";
import { supabase } from "../db/supabase.js";
import { formatDigestForTeams } from "../digest/teams-formatter.js";
import type { DigestData, DigestSection } from "../digest/builder.js";

const SECTION_CONFIG: Record<string, { label: string; emoji: string }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "Новости Зорки", emoji: "🏢" },
  [CATEGORIES.INDUSTRY]: { label: "Индустрия", emoji: "📊" },
  [CATEGORIES.RESEARCH]: { label: "Исследования рынка", emoji: "📈" },
  [CATEGORIES.VERTICAL]: { label: "Новости по вертикалям клиентов", emoji: "🏭" },
  [CATEGORIES.CLIENT]: { label: "Новости клиентов", emoji: "👥" },
  [CATEGORIES.COMPETITOR]: { label: "Конкуренты клиентов", emoji: "🔍" },
};

async function main() {
  const driveUrl = process.argv[2];
  if (!driveUrl) {
    console.error("Usage: tsx resend-last-digest.ts <drive_url>");
    process.exit(1);
  }

  // Find latest sent digest
  const { data: lastDigest } = await supabase
    .from("digests")
    .select("*")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (!lastDigest) {
    console.error("No sent digest found");
    process.exit(1);
  }

  // Get items from this digest
  const { data: items } = await supabase
    .from("news_items")
    .select("*")
    .eq("digest_id", lastDigest.id);

  if (!items?.length) {
    console.error("No items found for digest");
    process.exit(1);
  }

  // Group by category
  const sections: DigestSection[] = [];
  for (const [category, cfg] of Object.entries(SECTION_CONFIG)) {
    const sectionItems = items.filter((i) => i.category === category);
    if (sectionItems.length === 0) continue;
    sections.push({
      category: category as any,
      label: cfg.label,
      emoji: cfg.emoji,
      items: sectionItems,
    });
  }

  const digest: DigestData = {
    digestId: lastDigest.id,
    date: new Date(lastDigest.sent_at).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    sections,
    totalItems: items.length,
  };

  console.log(`Resending digest ${digest.digestId} with ${digest.totalItems} items + Drive link`);

  const payload = formatDigestForTeams(digest, driveUrl);
  const response = await fetch(process.env.TEAMS_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    console.log("Resent successfully");
  } else {
    console.error(`Failed: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
