import "../config.js";
import { syncClients } from "../hubspot/client-sync.js";
import { detectCompetitors } from "../ai/summarizer.js";

async function main() {
  console.log("=== Manual HubSpot sync ===\n");
  const clients = await syncClients();
  console.log(`\nSynced ${clients.length} clients`);

  console.log("\n=== Detecting competitors ===\n");
  await detectCompetitors();

  console.log("\n=== Done ===");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
