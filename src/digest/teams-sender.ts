import { config } from "../config.js";
import { supabase } from "../db/supabase.js";
import { buildDigest } from "./builder.js";
import { formatDigestForTeams } from "./teams-formatter.js";
import { generateAndUploadPptx } from "../scripts/generate-pptx.js";
import { writeNewsToHubSpot } from "../hubspot/notes.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postToTeams(payload: object): Promise<{ ok: boolean; status: number; text: string }> {
  const webhookUrl = config.teams.webhookUrl;
  if (!webhookUrl) {
    throw new Error("TEAMS_WEBHOOK_URL is not configured");
  }

  const body = JSON.stringify(payload);

  // Check payload size (Teams limit is ~28KB)
  if (body.length > 25000) {
    console.warn(`Payload size ${body.length} bytes, close to Teams limit`);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await response.text();

    if (response.ok) {
      return { ok: true, status: response.status, text };
    }

    if (response.status === 429) {
      console.log(`Teams rate limited, retrying in ${(attempt + 1) * 2}s...`);
      await delay((attempt + 1) * 2000);
      continue;
    }

    return { ok: false, status: response.status, text };
  }

  return { ok: false, status: 429, text: "Rate limit exceeded after retries" };
}

export async function sendDigest(): Promise<boolean> {
  console.log("Building digest...");
  const digest = await buildDigest();

  if (!digest) {
    console.log("No digest to send (no ready items)");
    return false;
  }

  console.log(
    `Digest built: ${digest.totalItems} items across ${digest.sections.length} sections`
  );

  // Generate PPTX and upload to Google Drive
  console.log("Generating PPTX and uploading to Google Drive...");
  let driveUrl: string | undefined;
  try {
    driveUrl = await generateAndUploadPptx() ?? undefined;
  } catch (err) {
    console.error("PPTX/Drive step failed (continuing without link):", err);
  }

  const teamsPayload = formatDigestForTeams(digest, driveUrl);
  console.log("Sending to Teams...");

  const result = await postToTeams(teamsPayload);

  // Update digest record
  await supabase
    .from("digests")
    .update({
      status: result.ok ? "sent" : "failed",
      sent_at: result.ok ? new Date().toISOString() : null,
      teams_response: `${result.status}: ${result.text}`,
    })
    .eq("id", digest.digestId);

  if (result.ok) {
    console.log("Digest sent to Teams successfully!");

    // Write client & competitor news to HubSpot company notes
    console.log("\nWriting news to HubSpot company notes...");
    const allItems = digest.sections.flatMap((s) => s.items);
    try {
      await writeNewsToHubSpot(allItems);
    } catch (err) {
      console.error("HubSpot notes step failed (non-critical):", err);
    }
  } else {
    console.error(
      `Failed to send digest to Teams: ${result.status} - ${result.text}`
    );
  }

  return result.ok;
}
