import "../config.js";
import { collectTelegramNews } from "../collectors/telegram.js";
import {
  collectClientNews,
  collectCompetitorNews,
  collectIndustryGoogleNews,
} from "../collectors/google-news.js";
import { collectIndustryRss } from "../collectors/industry-rss.js";
import { deduplicateNews } from "../utils/dedup.js";
import { summarizeNews, markReadyItems } from "../ai/summarizer.js";

async function main() {
  console.log("=== Manual news collection ===\n");

  await collectTelegramNews();
  await collectIndustryRss();
  await collectIndustryGoogleNews();
  await collectClientNews();
  await collectCompetitorNews();
  await deduplicateNews();

  console.log("\n=== Running AI summarization ===\n");
  await summarizeNews();
  await markReadyItems();

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
