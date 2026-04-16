import RssParser from "rss-parser";
import { CATEGORIES, RESEARCH_RSS_FEEDS } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";

const parser = new RssParser({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  timeout: 10000,
});

export async function collectResearchRss(): Promise<number> {
  console.log("Collecting from research RSS feeds...");
  let totalInserted = 0;

  for (const feed of RESEARCH_RSS_FEEDS) {
    try {
      console.log(`  Fetching ${feed.name}...`);
      const parsed = await parser.parseURL(feed.url);

      let inserted = 0;
      for (const item of (parsed.items || []).slice(0, 15)) {
        const newsItem: Partial<NewsItem> = {
          category: CATEGORIES.RESEARCH,
          title: item.title || "Untitled",
          url: item.link || "",
          source_name: feed.name,
          raw_content: item.contentSnippet || item.content || null,
          published_at: item.isoDate || item.pubDate || null,
          status: "raw",
          related_entity: feed.name,
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

      console.log(`  ${feed.name}: ${parsed.items?.length || 0} total, ${inserted} new`);
      totalInserted += inserted;
    } catch (err) {
      console.error(`  Failed to fetch ${feed.name}:`, err);
    }
  }

  console.log(`Research RSS: inserted ${totalInserted} new items total`);
  return totalInserted;
}
