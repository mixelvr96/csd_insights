import "dotenv/config";
import RssParser from "rss-parser";
import { INDUSTRY_RSS_FEEDS, INDUSTRY_KEYWORDS } from "../config.js";

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
  for (const kw of INDUSTRY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

async function main() {
  for (const feed of INDUSTRY_RSS_FEEDS) {
    console.log(`\n--- ${feed.name} ---`);
    console.log(`URL: ${feed.url}`);
    try {
      const parsed = await parser.parseURL(feed.url);
      const total = parsed.items?.length || 0;
      const relevant = (parsed.items || []).filter((item) => {
        const text = `${item.title || ""} ${item.contentSnippet || ""}`;
        return isRelevant(text);
      });
      console.log(`✅ ${total} items, ${relevant.length} relevant`);
      if (relevant.length > 0) {
        console.log(`   Пример: ${relevant[0].title}`);
      } else if (total > 0) {
        console.log(`   Пример (нерелевантный): ${parsed.items![0].title}`);
      }
    } catch (err: any) {
      console.log(`❌ Ошибка: ${err.message?.substring(0, 100)}`);
    }
  }
}

main().catch(console.error);
