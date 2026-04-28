import "dotenv/config";
import { config } from "../config.js";
import { supabase } from "../db/supabase.js";
import { buildDigest } from "../digest/builder.js";
import { formatDigestForTeams } from "../digest/teams-formatter.js";
import { generateAndUploadPptx } from "./generate-pptx.js";

async function main() {
  // Reset yesterday's digest so its items become eligible again
  const { data: prev } = await supabase
    .from("digests")
    .select("id")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  if (prev) {
    console.log(`Resetting items from previous digest ${prev.id}...`);
    await supabase
      .from("news_items")
      .update({ status: "ready", digest_id: null })
      .eq("digest_id", prev.id);
    await supabase.from("digests").delete().eq("id", prev.id);
    console.log("Previous digest cleared.\n");
  }

  console.log("Building digest...");
  const digest = await buildDigest();
  if (!digest) {
    console.log("No items to send");
    return;
  }
  console.log(`Built ${digest.totalItems} items across ${digest.sections.length} sections`);

  console.log("Generating PPTX → Google Drive...");
  const driveUrl = (await generateAndUploadPptx(digest.digestId)) ?? undefined;

  console.log("Sending Teams card...");
  const payload = formatDigestForTeams(digest, driveUrl);
  const response = await fetch(config.teams.webhookUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    await supabase
      .from("digests")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", digest.digestId);
    console.log("✅ Resent successfully (HubSpot notes skipped to avoid duplicates)");
  } else {
    console.error(`Failed: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
