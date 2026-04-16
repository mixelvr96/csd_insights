import RssParser from "rss-parser";
import { CATEGORIES, RESEARCH_QUERIES, type Category } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";
import { getActiveClients } from "../hubspot/client-sync.js";

const parser = new RssParser();

function buildGoogleNewsUrl(query: string): string {
  // "when:14d" limits results to last 14 days at source level
  const fullQuery = `${query} when:14d`;
  const encoded = encodeURIComponent(fullQuery);
  return `https://news.google.com/rss/search?q=${encoded}&hl=ru&gl=RU&ceid=RU:ru`;
}

async function resolveGoogleNewsUrl(gnUrl: string): Promise<string> {
  if (!gnUrl.includes("news.google.com")) return gnUrl;
  try {
    const response = await fetch(gnUrl, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    return response.url || gnUrl;
  } catch {
    return gnUrl;
  }
}

interface CollectedItem {
  title: string;
  url: string;
  content: string | null;
  publishedAt: string | null;
  category: Category;
  relatedEntity: string | null;
  sourceName: string;
}

async function fetchGoogleNewsRss(
  query: string,
  category: Category,
  relatedEntity: string | null
): Promise<CollectedItem[]> {
  const url = buildGoogleNewsUrl(query);
  try {
    const feed = await parser.parseURL(url);
    const items: CollectedItem[] = [];
    for (const item of (feed.items || []).slice(0, 10)) {
      const resolvedUrl = await resolveGoogleNewsUrl(item.link || "");
      items.push({
        title: item.title || "Untitled",
        url: resolvedUrl,
        content: item.contentSnippet || item.content || null,
        publishedAt: item.isoDate || item.pubDate || null,
        category,
        relatedEntity,
        sourceName: "google_news",
      });
    }
    return items;
  } catch (err) {
    console.error(`Failed to fetch Google News for query "${query}":`, err);
    return [];
  }
}

export async function collectClientNews(): Promise<number> {
  const clients = await getActiveClients();
  if (!clients.length) {
    console.log("No active clients found, skipping client news collection");
    return 0;
  }

  console.log(`Collecting news for ${clients.length} clients...`);
  const allItems: CollectedItem[] = [];

  for (const client of clients) {
    const query = `"${client.company_name}" (CMO OR маркетинг OR agency OR M&A OR acquisition OR назначен OR партнерство)`;
    const items = await fetchGoogleNewsRss(
      query,
      CATEGORIES.CLIENT,
      client.company_name
    );
    allItems.push(...items);
    // Respect rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  return saveItems(allItems);
}

export async function collectCompetitorNews(): Promise<number> {
  const clients = await getActiveClients();
  if (!clients.length) return 0;

  console.log("Collecting competitor news...");
  const allItems: CollectedItem[] = [];
  const searchedCompetitors = new Set<string>();

  // Build competitor→client mapping
  const competitorToClients = new Map<string, string[]>();
  for (const client of clients) {
    const competitors = client.competitors as string[] | null;
    if (!competitors?.length) continue;
    for (const competitor of competitors) {
      const existing = competitorToClients.get(competitor) || [];
      if (!existing.includes(client.company_name)) {
        existing.push(client.company_name);
      }
      competitorToClients.set(competitor, existing);
    }
  }

  for (const [competitor, clientNames] of competitorToClients) {
    if (searchedCompetitors.has(competitor)) continue;
    searchedCompetitors.add(competitor);

    const query = `"${competitor}" (маркетинг OR реклама OR кампания OR запуск OR ребрендинг OR digital)`;
    // Store as "Competitor (конкурент Client1, Client2)"
    const relatedEntity = `${competitor} (конкурент: ${clientNames.join(", ")})`;
    const items = await fetchGoogleNewsRss(
      query,
      CATEGORIES.COMPETITOR,
      relatedEntity
    );
    allItems.push(...items);
    await new Promise((r) => setTimeout(r, 500));
  }

  return saveItems(allItems);
}

export async function collectIndustryGoogleNews(): Promise<number> {
  console.log("Collecting industry news from Google News...");

  const queries = [
    // РФ рынок — приоритет
    '"Яндекс Директ" обновление OR новости OR изменения',
    '"VK Ads" OR "VK Реклама" обновление OR новости',
    '"ФЗ О рекламе" изменения OR поправки OR ограничения OR маркировка',
    '"ОРД" OR "оператор рекламных данных" маркировка OR реклама',
    '"AppsFlyer" OR "Adjust" обновление OR новости OR атрибуция',
    'performance маркетинг Россия тренды',
    'мобильная реклама OR "app install" OR "user acquisition" Россия',
    '"МФО" реклама OR ограничения OR регулирование',
    // Зарубежка — трекеры и платформы
    'AppsFlyer attribution OR SKAN OR "privacy sandbox" OR update',
    'Adjust mobile measurement OR attribution OR "fraud prevention"',
    '"mobile attribution" OR "app install" OR "user acquisition" trends',
    '"Meta CAPI" OR "Google Privacy Sandbox" OR "SKAN 5" OR "AdAttributionKit"',
    '"Google Ads" обновление OR update OR новая функция',
    '"TikTok Ads" OR "TikTok for Business" новости',
    '"mobile performance marketing" trends OR update',
  ];

  const allItems: CollectedItem[] = [];
  for (const query of queries) {
    const items = await fetchGoogleNewsRss(query, CATEGORIES.INDUSTRY, null);
    allItems.push(...items);
    await new Promise((r) => setTimeout(r, 500));
  }

  return saveItems(allItems);
}

async function saveItems(items: CollectedItem[]): Promise<number> {
  let inserted = 0;
  for (const item of items) {
    if (!item.url) continue;

    const newsItem: Partial<NewsItem> = {
      category: item.category,
      title: item.title,
      url: item.url,
      source_name: item.sourceName,
      raw_content: item.content,
      published_at: item.publishedAt,
      status: "raw",
      related_entity: item.relatedEntity,
      summary: null,
      implication: null,
      relevance_score: null,
    };

    const { error } = await supabase
      .from("news_items")
      .upsert(newsItem, { onConflict: "url", ignoreDuplicates: true });
    if (!error) inserted++;
  }

  console.log(
    `Google News: found ${items.length} items, inserted ${inserted} new`
  );
  return inserted;
}

export async function collectResearchNews(): Promise<number> {
  console.log("Collecting research & market reports...");

  const allItems: CollectedItem[] = [];
  for (const query of RESEARCH_QUERIES) {
    const items = await fetchGoogleNewsRss(query, CATEGORIES.RESEARCH, null);
    allItems.push(...items);
    await new Promise((r) => setTimeout(r, 500));
  }

  return saveItems(allItems);
}

// Vertical industry news — based on client industries
const VERTICAL_QUERIES: Record<string, string[]> = {
  "Финтех / МФО": [
    '"МФО" OR "микрофинансов" регулирование OR ограничения OR ЦБ OR конверсия',
    'финтех Россия тренды OR регулирование OR лицензирование',
  ],
  "E-commerce / Маркетплейсы": [
    'маркетплейс Россия реклама OR продвижение OR тренды',
    'e-commerce Россия рынок OR тренды OR аналитика',
  ],
  "Беттинг / Гемблинг": [
    'букмекер Россия реклама OR регулирование OR ограничения',
    '"азартные игры" реклама OR ФЗ OR ограничения',
  ],
  "Мобильные приложения": [
    '"мобильные приложения" Россия продвижение OR UA OR user acquisition',
    'app store optimization OR ASO тренды',
  ],
  "Недвижимость": [
    'недвижимость Россия маркетинг OR реклама OR digital',
  ],
  "Каршеринг / Мобильность": [
    'каршеринг Россия маркетинг OR реклама OR промо',
  ],
};

export async function collectVerticalNews(): Promise<number> {
  console.log("Collecting vertical industry news...");

  const allItems: CollectedItem[] = [];
  for (const [vertical, queries] of Object.entries(VERTICAL_QUERIES)) {
    for (const query of queries) {
      const items = await fetchGoogleNewsRss(
        query,
        CATEGORIES.VERTICAL,
        vertical
      );
      allItems.push(...items);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return saveItems(allItems);
}
