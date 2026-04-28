import express from "express";
import cron from "node-cron";
import { config } from "./config.js";
import { syncClients } from "./hubspot/client-sync.js";
import { collectTelegramNews } from "./collectors/telegram.js";
import {
  collectClientNews,
  collectCompetitorNews,
  collectIndustryGoogleNews,
  collectResearchNews,
  collectVerticalNews,
} from "./collectors/google-news.js";
import { collectIndustryRss } from "./collectors/industry-rss.js";
import { collectResearchRss } from "./collectors/research-rss.js";
import { deduplicateNews } from "./utils/dedup.js";
import {
  summarizeNews,
  detectCompetitors,
  markReadyItems,
} from "./ai/summarizer.js";
import { sendDigest } from "./digest/teams-sender.js";
import { supabase } from "./db/supabase.js";

const app = express();
app.use(express.json());

// --- Full pipeline functions ---

async function runCollection() {
  console.log("\n=== Starting news collection ===");
  const start = Date.now();

  try {
    await collectTelegramNews();
    await collectIndustryRss();
    await collectResearchRss();
    await collectIndustryGoogleNews();
    await collectResearchNews();
    await collectVerticalNews();
    await collectClientNews();
    await collectCompetitorNews();
    await deduplicateNews();
    console.log(
      `=== Collection complete in ${((Date.now() - start) / 1000).toFixed(1)}s ===\n`
    );
  } catch (err) {
    console.error("Collection error:", err);
  }
}

async function runProcessing() {
  console.log("\n=== Starting AI processing ===");
  try {
    let batch = 1;
    while (true) {
      console.log(`AI batch ${batch}...`);
      const n = await summarizeNews();
      if (n === 0) break;
      batch++;
    }
    await markReadyItems();
    console.log("=== Processing complete ===\n");
  } catch (err) {
    console.error("Processing error:", err);
  }
}

async function runDigest() {
  console.log("\n=== Building and sending digest ===");
  try {
    const success = await sendDigest();
    console.log(`=== Digest ${success ? "sent" : "skipped/failed"} ===\n`);
    return success;
  } catch (err) {
    console.error("Digest error:", err);
    return false;
  }
}

// --- Cron jobs ---

// Biweekly digest cadence — fixed epoch (Mon 2024-01-08 was a digest day),
// works correctly across year boundaries.
const BIWEEKLY_EPOCH_MS = new Date("2024-01-08T00:00:00Z").getTime();
function isDigestWeek(now: Date = new Date()): boolean {
  const weeksSinceEpoch = Math.floor(
    (now.getTime() - BIWEEKLY_EPOCH_MS) / (7 * 24 * 60 * 60 * 1000)
  );
  return weeksSinceEpoch % 2 === 0;
}

// Sunday 06:00 Moscow (03:00 UTC): sync clients → collect news (Telegram + RSS + Google News)
cron.schedule("0 3 * * 0", async () => {
  await syncClients();
  await detectCompetitors();
  await runCollection();
});

// Every other Monday at 08:00 Moscow (05:00 UTC): AI processing
cron.schedule("0 5 * * 1", async () => {
  if (isDigestWeek()) {
    await runProcessing();
  } else {
    console.log("Off-week Monday — skipping processing");
  }
});

// Every other Monday at 10:00 Moscow (07:00 UTC): build & send digest
cron.schedule("0 7 * * 1", async () => {
  if (isDigestWeek()) {
    await runDigest();
  } else {
    console.log("Off-week Monday — skipping digest");
  }
});

// --- API endpoints ---

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/api/collect", async (_req, res) => {
  try {
    await runCollection();
    res.json({ status: "ok", message: "Collection complete" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/process", async (_req, res) => {
  try {
    await runProcessing();
    res.json({ status: "ok", message: "Processing complete" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/digest", async (_req, res) => {
  try {
    const success = await runDigest();
    res.json({ status: success ? "sent" : "no_items" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sync-clients", async (_req, res) => {
  try {
    const clients = await syncClients();
    await detectCompetitors();
    res.json({ status: "ok", clients: clients.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/status", async (_req, res) => {
  try {
    const { count: totalItems } = await supabase
      .from("news_items")
      .select("*", { count: "exact", head: true });

    const { count: readyItems } = await supabase
      .from("news_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "ready");

    const { count: rawItems } = await supabase
      .from("news_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "raw");

    const { data: lastDigest } = await supabase
      .from("digests")
      .select("*")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    const { count: activeClients } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("active", true);

    res.json({
      news: { total: totalItems, raw: rawItems, ready: readyItems },
      clients: { active: activeClients },
      lastDigest: lastDigest
        ? { sentAt: lastDigest.sent_at, itemCount: lastDigest.item_count }
        : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start server ---

app.listen(config.port, () => {
  console.log(`CSD Insights server running on port ${config.port}`);
  console.log("Cron jobs registered (server timezone: UTC):");
  console.log("  - HubSpot sync + news collection: Sunday 06:00 MSK");
  console.log("  - AI processing: every other Monday 08:00 MSK");
  console.log("  - Digest send: every other Monday 10:00 MSK");
});
