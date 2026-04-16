import "../config.js";
import { sendDigest } from "../digest/teams-sender.js";

async function main() {
  console.log("=== Manual digest send ===\n");
  const success = await sendDigest();
  console.log(`\nResult: ${success ? "Sent successfully" : "No items or failed"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
