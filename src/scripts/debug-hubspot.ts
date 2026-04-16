import "dotenv/config";
import { config } from "../config.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

async function main() {
  // Fetch first 5 deals to inspect their properties
  const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/deals/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.hubspot.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "pipeline",
              operator: "EQ",
              value: config.hubspot.pipelineId,
            },
          ],
        },
      ],
      properties: [
        "dealname",
        "pipeline",
        "dealstage",
        "company",
        "hs_company_name",
        "associatedcompanyid",
      ],
      limit: 5,
    }),
  });

  const data = await response.json();
  console.log("Total deals:", data.total);
  console.log("\nFirst 5 deals:\n");

  for (const deal of data.results) {
    console.log(`Deal ID: ${deal.id}`);
    console.log("Properties:", JSON.stringify(deal.properties, null, 2));
    console.log("---");
  }
}

main().catch(console.error);
