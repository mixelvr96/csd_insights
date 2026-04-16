import { config } from "../config.js";
import { supabase, type Client } from "../db/supabase.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function hubspotRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.hubspot.token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      console.log("HubSpot rate limit hit, waiting 1s...");
      await delay(1000);
      return hubspotRequest(endpoint, options);
    }
    const errorText = await response.text();
    throw new Error(`HubSpot API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

interface HubSpotDeal {
  id: string;
  properties: {
    dealname: string;
    pipeline: string;
    dealstage: string;
    hs_lastmodifieddate: string;
    [key: string]: string | null;
  };
}

interface HubSpotAssociationsResponse {
  results: { id: string; type: string }[];
}

async function getCompanyIdForDeal(dealId: string): Promise<string | null> {
  try {
    const resp = await hubspotRequest<HubSpotAssociationsResponse>(
      `/crm/v3/objects/deals/${dealId}/associations/companies`
    );
    return resp.results?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

interface HubSpotSearchResponse {
  total: number;
  results: HubSpotDeal[];
  paging?: { next?: { after: string } };
}

async function fetchDealsFromPipeline(): Promise<HubSpotDeal[]> {
  const allDeals: HubSpotDeal[] = [];
  let after: string | undefined;

  do {
    const body: any = {
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
        "hs_lastmodifieddate",
        "company",
      ],
      limit: 100,
    };
    if (after) body.after = after;

    const response = await hubspotRequest<HubSpotSearchResponse>(
      "/crm/v3/objects/deals/search",
      { method: "POST", body: JSON.stringify(body) }
    );

    allDeals.push(...response.results);
    after = response.paging?.next?.after;
  } while (after);

  return allDeals;
}

function extractCompanyName(deal: HubSpotDeal): string {
  if (deal.properties.company) return deal.properties.company;

  const name = deal.properties.dealname || "";
  // Deal format: "Feb - Фитмост", "Mar - ЦУМ" → extract part after " - "
  const match = name.match(/^\w{3,4}\s*[-–—]\s*(.+)$/);
  if (match) return match[1].trim();

  return name;
}

export async function syncClients(): Promise<Client[]> {
  console.log("Syncing clients from HubSpot pipeline...");
  const deals = await fetchDealsFromPipeline();
  console.log(`Found ${deals.length} deals in pipeline ${config.hubspot.pipelineId}`);

  // Deduplicate by company name + fetch company IDs
  const companiesMap = new Map<string, Client>();
  for (const deal of deals) {
    const companyName = extractCompanyName(deal);
    if (!companiesMap.has(companyName)) {
      const companyId = await getCompanyIdForDeal(deal.id);
      companiesMap.set(companyName, {
        company_name: companyName,
        hubspot_deal_id: deal.id,
        hubspot_company_id: companyId,
        pipeline_stage: deal.properties.dealstage,
        industry: null,
        competitors: null,
        active: true,
      });
    }
  }

  const clients = Array.from(companiesMap.values());

  // Mark all existing clients as inactive
  await supabase.from("clients").update({ active: false }).eq("active", true);

  // Upsert current clients
  for (const client of clients) {
    const { error } = await supabase
      .from("clients")
      .upsert(
        {
          ...client,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "company_name" }
      );
    if (error) {
      console.error(`Error upserting client ${client.company_name}:`, error);
    }
  }

  console.log(`Synced ${clients.length} unique clients`);
  return clients;
}

export async function getActiveClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("active", true);

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return data || [];
}
