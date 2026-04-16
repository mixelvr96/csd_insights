import * as cheerio from "cheerio";
import { config, CATEGORIES } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";

/**
 * Collects posts from a public Telegram channel using the web preview (t.me/s/).
 * No bot token required for public channels.
 */
export async function collectTelegramNews(): Promise<number> {
  const channel = config.telegram.channel;
  if (!channel) {
    console.log("TELEGRAM_CHANNEL not set, skipping Telegram collection");
    return 0;
  }

  const url = `https://t.me/s/${channel}`;
  console.log(`Fetching Telegram channel: ${url}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Telegram channel: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const posts: Partial<NewsItem>[] = [];

  $(".tgme_widget_message_wrap").each((_, el) => {
    const messageEl = $(el).find(".tgme_widget_message");
    const messageId = messageEl.attr("data-post");
    if (!messageId) return;

    const textEl = $(el).find(".tgme_widget_message_text");
    const text = textEl.text().trim();
    if (!text) return;

    const dateEl = $(el).find(".tgme_widget_message_date time");
    const datetime = dateEl.attr("datetime");

    // Extract first meaningful line as title, clean up emoji/formatting
    const lines = text.split("\n").filter((l) => l.trim());
    let title = lines[0] || text;
    // Strip leading emoji sequences and whitespace
    title = title.replace(/^[\s\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}]+/gu, "").trim();
    // If title is empty after cleanup or too short, try next line
    if (title.length < 10 && lines.length > 1) {
      title = lines[1]?.replace(/^[\s\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}]+/gu, "").trim() || title;
    }
    title = title.substring(0, 150);

    const postUrl = `https://t.me/${messageId}`;

    posts.push({
      category: CATEGORIES.ZORKA_AGENCY,
      title,
      url: postUrl,
      source_name: "telegram",
      raw_content: text,
      published_at: datetime || null,
      status: "raw",
      related_entity: null,
      summary: null,
      implication: null,
      relevance_score: 1.0, // Agency's own posts are always relevant
    });
  });

  let inserted = 0;
  for (const post of posts) {
    const { error } = await supabase
      .from("news_items")
      .upsert(post, { onConflict: "url", ignoreDuplicates: true });
    if (!error) inserted++;
  }

  console.log(
    `Telegram: found ${posts.length} posts, inserted ${inserted} new`
  );
  return inserted;
}
