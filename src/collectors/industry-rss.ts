import RssParser from "rss-parser";
import { CATEGORIES, INDUSTRY_KEYWORDS, INDUSTRY_RSS_FEEDS } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";

const parser = new RssParser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  timeout: 10000,
});

function isRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  let matchCount = 0;
  for (const keyword of INDUSTRY_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }
  // Require at least 1 keyword match
  return matchCount >= 1;
}

export async function collectIndustryRss(): Promise<number> {
  console.log("Collecting from curated industry RSS feeds...");
  let totalInserted = 0;

  for (const feed of INDUSTRY_RSS_FEEDS) {
    try {
      console.log(`  Fetching ${feed.name}...`);
      const parsed = await parser.parseURL(feed.url);

      const relevant = feed.skipFilter
        ? (parsed.items || [])
        : (parsed.items || []).filter((item) => {
            const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.content || ""}`;
            return isRelevant(text);
          });

      let inserted = 0;
      for (const item of relevant.slice(0, 15)) {
        const newsItem: Partial<NewsItem> = {
          category: CATEGORIES.INDUSTRY,
          title: item.title || "Untitled",
          url: item.link || "",
          source_name: feed.name,
          raw_content: item.contentSnippet || item.content || null,
          published_at: item.isoDate || item.pubDate || null,
          status: "raw",
          related_entity: null,
          summary: null,
          implication: null,
          relevance_score: null,
        };

        if (!newsItem.url) continue;

        const { error } = await supabase
          .from("news_items")
          .upsert(newsItem, { onConflict: "url", ignoreDuplicates: true });
        if (!error) inserted++;
      }

      console.log(
        `  ${feed.name}: ${parsed.items?.length || 0} total, ${relevant.length} relevant, ${inserted} new`
      );
      totalInserted += inserted;
    } catch (err) {
      console.error(`  Failed to fetch ${feed.name}:`, err);
    }
  }

  console.log(`Industry RSS: inserted ${totalInserted} new items total`);
  return totalInserted;
}
