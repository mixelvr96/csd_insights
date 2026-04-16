import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  hubspot: {
    token: required("HUBSPOT_TOKEN"),
    pipelineId: "861970596",
  },
  anthropic: {
    apiKey: required("ANTHROPIC_API_KEY"),
    model: "claude-sonnet-4-20250514",
  },
  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  },
  teams: {
    webhookUrl: process.env.TEAMS_WEBHOOK_URL || "",
  },
  telegram: {
    channel: process.env.TELEGRAM_CHANNEL || "",
  },
  port: parseInt(process.env.PORT || "3000", 10),
} as const;

export const CATEGORIES = {
  ZORKA_AGENCY: "zorka_agency",
  INDUSTRY: "industry",
  RESEARCH: "research",
  VERTICAL: "vertical",
  COMPETITOR: "competitor",
  CLIENT: "client",
} as const;

export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

export const INDUSTRY_KEYWORDS = [
  "Google Ads",
  "Meta Ads",
  "Facebook Ads",
  "TikTok Ads",
  "VK Ads",
  "Яндекс Директ",
  "AppsFlyer",
  "Adjust",
  "performance marketing",
  "перформанс маркетинг",
  "programmatic",
  "mobile attribution",
  "app install",
  "CPI",
  "CPA",
  "ROAS",
  "ретаргетинг",
  "retargeting",
  "in-app advertising",
  // Broader Russian industry terms
  "реклама",
  "рекламн",
  "маркетинг",
  "digital",
  "диджитал",
  "медиабаинг",
  "таргетинг",
  "контекстная реклама",
  "медийная реклама",
  "influence",
  "инфлюенс",
  "блогер",
  "трафик",
  "конверсия",
  "арбитраж",
  "агентство",
  "бренд",
  "SEO",
  "SMM",
  "e-commerce",
  "маркетплейс",
];

// skipFilter: true = take all articles from this source (it's already niche enough)
export const INDUSTRY_RSS_FEEDS: { name: string; url: string; skipFilter?: boolean }[] = [
  { name: "Sostav.ru", url: "https://www.sostav.ru/rss", skipFilter: true },
  { name: "Cossa.ru", url: "https://www.cossa.ru/rss/", skipFilter: true },
  { name: "AdExchanger", url: "https://www.adexchanger.com/feed/", skipFilter: true },
  { name: "PPC Hero", url: "https://www.ppchero.com/feed/", skipFilter: true },
  { name: "vc.ru", url: "https://vc.ru/rss" },
  { name: "AdIndex.ru", url: "https://adindex.ru/news/news.rss", skipFilter: true },
  { name: "Digiday", url: "https://digiday.com/feed/" },
  { name: "Adweek", url: "https://www.adweek.com/feed/" },
];

// Research & analytics sources
export const RESEARCH_RSS_FEEDS: { name: string; url: string }[] = [
  { name: "АКАР", url: "https://www.akarussia.ru/rss.xml" },
  { name: "АРИР", url: "https://arir.ru/rss" },
  { name: "Медиаскоп", url: "https://mediascope.net/rss/" },
  { name: "Data Insight", url: "https://datainsight.ru/rss" },
];

// Google News queries for research & market reports
export const RESEARCH_QUERIES = [
  '"АКАР" исследование OR рынок OR отчет OR рекламный рынок',
  '"АРИР" исследование OR digital OR интернет-реклама',
  '"Медиаскоп" исследование OR аудитория OR рейтинг',
  '"Data Insight" исследование OR e-commerce OR рынок',
  'рынок интернет-рекламы Россия исследование OR отчет OR аналитика',
  '"ФЗ О рекламе" изменения OR поправки OR новые требования',
  '"рекламный рынок" Россия объем OR рост OR прогноз',
];
