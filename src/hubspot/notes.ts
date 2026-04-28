import { config } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";
import { CATEGORIES } from "../config.js";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function hubspotRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      await delay(1000);
      return hubspotRequest(endpoint, options);
    }
    const text = await response.text();
    throw new Error(`HubSpot API ${response.status}: ${text}`);
  }

  return response.json();
}

function buildNoteBody(item: NewsItem, driveUrl?: string): string {
  const lines: string[] = [];
  lines.push(`📰 ${item.title}`);
  lines.push("");
  if (item.summary) lines.push(item.summary);

  if (item.implication) {
    lines.push("");
    const agencyMatch = item.implication.match(/Для агентства:\s*(.*?)(?=Для клиентов:|$)/s);
    const clientMatch = item.implication.match(/Для клиентов:\s*(.*?)$/s);
    if (agencyMatch) lines.push(`🏢 Для агентства: ${agencyMatch[1].trim()}`);
    if (clientMatch) lines.push(`👥 Для клиентов: ${clientMatch[1].trim()}`);
    if (!agencyMatch && !clientMatch) lines.push(`💡 ${item.implication}`);
  }

  lines.push("");
  lines.push(`🔗 Источник: ${item.url}`);
  if (driveUrl) lines.push(`📊 Полный дайджест: ${driveUrl}`);
  lines.push(`— CSD Insights, ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`);

  return lines.join("\n");
}

async function createNoteOnCompany(companyId: string, noteBody: string): Promise<void> {
  // Create note
  const { id: noteId } = await hubspotRequest<{ id: string }>("/crm/v3/objects/notes", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_note_body: noteBody,
        hs_timestamp: new Date().toISOString(),
      },
    }),
  });

  // Associate with company
  await hubspotRequest(`/crm/v3/objects/notes/${noteId}/associations/companies/${companyId}/note_to_company`, {
    method: "PUT",
  });
}

function extractClientName(item: NewsItem): string | null {
  if (item.category === CATEGORIES.CLIENT) {
    return item.related_entity ?? null;
  }
  if (item.category === CATEGORIES.COMPETITOR && item.related_entity) {
    // Format: "CompetitorName (конкурент: ClientName)"
    const match = item.related_entity.match(/\(конкурент:\s*(.+?)\)/);
    return match ? match[1].trim() : null;
  }
  return null;
}

export async function writeNewsToHubSpot(items: NewsItem[], driveUrl?: string): Promise<void> {
  const relevantItems = items.filter(
    (i) => i.category === CATEGORIES.CLIENT || i.category === CATEGORIES.COMPETITOR
  );

  if (!relevantItems.length) return;

  // Load clients with company IDs
  const { data: clients } = await supabase
    .from("clients")
    .select("company_name, hubspot_company_id")
    .eq("active", true)
    .not("hubspot_company_id", "is", null);

  if (!clients?.length) {
    console.log("No clients with hubspot_company_id found — skipping HubSpot notes");
    return;
  }

  const companyMap = new Map(clients.map((c) => [c.company_name.toLowerCase(), c.hubspot_company_id as string]));

  let written = 0;
  for (const item of relevantItems) {
    const clientName = extractClientName(item);
    if (!clientName) continue;

    // Find matching company (fuzzy: check if any client name includes the entity name)
    let companyId: string | undefined;
    const lowerClient = clientName.toLowerCase();
    for (const [name, id] of companyMap) {
      if (name.includes(lowerClient) || lowerClient.includes(name)) {
        companyId = id;
        break;
      }
    }

    if (!companyId) {
      console.log(`  No HubSpot company found for: ${clientName}`);
      continue;
    }

    try {
      const noteBody = buildNoteBody(item, driveUrl);
      await createNoteOnCompany(companyId, noteBody);
      console.log(`  ✓ Note written to HubSpot: ${clientName} — ${item.title.slice(0, 50)}`);
      written++;
      await delay(200); // Avoid rate limit
    } catch (err) {
      console.error(`  ✗ Failed for ${clientName}:`, err);
    }
  }

  console.log(`HubSpot notes: ${written} written`);
}
