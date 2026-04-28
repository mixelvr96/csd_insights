import Anthropic from "@anthropic-ai/sdk";
import { config, CATEGORIES } from "../config.js";
import { supabase, type NewsItem } from "../db/supabase.js";
import { getActiveClients } from "../hubspot/client-sync.js";

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Process Зорка first, then client-relevant categories, then broader market context
const CATEGORY_PRIORITY = [
  CATEGORIES.ZORKA_AGENCY,
  CATEGORIES.CLIENT,
  CATEGORIES.COMPETITOR,
  CATEGORIES.VERTICAL,
  CATEGORIES.RESEARCH,
  CATEGORIES.INDUSTRY,
];

interface SummarizedItem {
  id: string;
  summary: string;
  implication: string | null;
  relevance_score: number;
  reject: boolean;
}

async function callClaude(prompt: string, attempt = 0): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    return textBlock?.text || "";
  } catch (err: any) {
    const isRateLimit = err?.status === 429 || err?.error?.type === "rate_limit_error";
    const isOverloaded = err?.status === 529 || err?.error?.type === "overloaded_error";
    if ((isRateLimit || isOverloaded) && attempt < 4) {
      const wait = 5000 * (attempt + 1);
      console.log(`  Anthropic ${err.status} — retrying in ${wait}ms (attempt ${attempt + 1}/4)`);
      await sleep(wait);
      return callClaude(prompt, attempt + 1);
    }
    throw err;
  }
}

function buildSummarizationPrompt(
  items: NewsItem[],
  category: string
): string {
  const itemsList = items
    .map(
      (item, i) =>
        `[${i + 1}] ID: ${item.id}
Заголовок: ${item.title}
Контент: ${item.raw_content || "Нет контента"}
Связанная компания: ${item.related_entity || "—"}
Источник: ${item.source_name}`
    )
    .join("\n\n");

  let instructions: string;

  if (category === CATEGORIES.INDUSTRY) {
    instructions = `Ты — аналитик в агентстве перформанс-маркетинга «Зорка». Фокус агентства — performance-маркетинг, особенно мобильный сектор (app install, UA, ретаргетинг, атрибуция, трекеры AppsFlyer/Adjust).

Для каждой новости:
1. Напиши краткое резюме (2-3 предложения на русском языке).
2. Напиши "implication" в формате двух абзацев:
   — «Для агентства: ...» — что это значит для работы «Зорки» как агентства, какие действия предпринять
   — «Для клиентов: ...» — как это влияет на клиентов агентства, что им рекомендовать
3. Оцени релевантность от 0 до 1. Ставь выше для новостей про: мобильный перформанс, трекеры (AppsFlyer, Adjust), атрибуцию, UA, app install, источники трафика (Meta, Google, TikTok, VK), programmatic.
4. Если новость нерелевантна (не связана с маркетингом/рекламой/digital), отметь reject: true.`;
  } else if (category === CATEGORIES.RESEARCH) {
    instructions = `Ты — аналитик в агентстве перформанс-маркетинга «Зорка». Фокус — performance-маркетинг, мобильный сектор.

Для каждого исследования/отчёта рынка:
1. Напиши краткое резюме (2-3 предложения на русском). Укажи ключевые цифры и выводы.
2. Напиши "implication" в формате:
   — «Для агентства: ...» — как использовать данные исследования в работе, питчах, стратегии
   — «Для клиентов: ...» — какие выводы транслировать клиентам
3. Оцени релевантность от 0 до 1. Выше для данных о рекламном рынке, mobile, performance.
4. Если это не исследование/отчёт/аналитика, отметь reject: true.`;
  } else if (category === CATEGORIES.VERTICAL) {
    instructions = `Ты — аналитик в агентстве перформанс-маркетинга «Зорка». Фокус — performance-маркетинг, мобильный сектор.

Для каждой новости из вертикали клиентов:
1. Напиши краткое резюме (2-3 предложения на русском). Укажи, как это влияет на рынок/вертикаль.
2. Напиши "implication" в формате:
   — «Для агентства: ...» — как это влияет на рекламные кампании в этой вертикали, что менять в стратегии
   — «Для клиентов: ...» — что рекомендовать клиентам из этой индустрии
3. Оцени релевантность от 0 до 1. Выше для регуляторных изменений, изменений в конверсиях, новых ограничений.
4. Если новость нерелевантна для маркетинга в этой вертикали, отметь reject: true.

ПРИМЕР хорошей новости: "С 1 апреля ввели новые ограничения для МФО" → высокая релевантность, т.к. влияет на конверсии по офферам клиентов.`;
  } else if (category === CATEGORIES.COMPETITOR) {
    instructions = `Ты — аналитик в агентстве перформанс-маркетинга «Зорка». Фокус — performance-маркетинг, мобильный сектор.

Для каждой новости о конкуренте клиента:
1. Напиши краткое резюме (2-3 предложения на русском языке).
2. Напиши "implication" в формате двух абзацев:
   — «Для агентства: ...» — как использовать эту информацию в работе с клиентом
   — «Для клиентов: ...» — как это влияет на конкурентную позицию клиента и что рекомендовать
3. Оцени релевантность от 0 до 1. Выше для новостей про маркетинг, рекламу, digital-стратегию конкурентов.
4. Если новость нерелевантна (спам, не про бизнес/маркетинг), отметь reject: true.`;
  } else if (category === CATEGORIES.CLIENT) {
    instructions = `Ты — аналитик в агентстве перформанс-маркетинга «Зорка». Фокус — performance-маркетинг, мобильный сектор.

Для каждой новости о клиенте:
1. Напиши краткое резюме (2-3 предложения на русском языке).
2. Объясни в "implication", почему это важно для работы агентства с этим клиентом.
3. Оцени релевантность от 0 до 1.
4. ОБЯЗАТЕЛЬНО отметь reject: true для:
   - Промо-акций, скидок, фрибетов, бонусов (это реклама, а не новость)
   - Рекламных и спонсорских материалов
   - Новостей не связанных с маркетингом, бизнесом, кадрами или стратегией компании
   - Спама, советов, рецептов, развлекательного контента`;
  } else {
    // zorka_agency
    instructions = `Ты — аналитик в агентстве «Зорка». Для каждого поста из нашего Telegram-канала:

1. Напиши краткое резюме (1-2 предложения на русском).
2. Релевантность ставь 1.0 (это наши собственные посты).
3. Не отмечай как reject.`;
  }

  return `${instructions}

Верни ответ СТРОГО в формате JSON массива:
[
  {
    "id": "uuid новости",
    "summary": "Краткое резюме на русском",
    "implication": "Для агентства: ... Для клиентов: ..." или null,
    "relevance_score": 0.85,
    "reject": false
  }
]

Вот новости для обработки:

${itemsList}`;
}

export async function summarizeNews(): Promise<number> {
  // Pull up to 50 raw items per call, prioritised by category so important
  // ones (Зорка, клиенты, конкуренты) never get squeezed out by a backlog.
  let processed = 0;
  let totalFetched = 0;
  const PER_CALL_LIMIT = 50;
  const BATCH_SIZE = 10;

  for (const category of CATEGORY_PRIORITY) {
    const remaining = PER_CALL_LIMIT - totalFetched;
    if (remaining <= 0) break;

    const { data: items } = await supabase
      .from("news_items")
      .select("*")
      .eq("status", "raw")
      .eq("category", category)
      .order("collected_at", { ascending: true })
      .limit(remaining);

    if (!items?.length) continue;
    totalFetched += items.length;
    console.log(`Summarizing ${items.length} ${category} items...`);

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const prompt = buildSummarizationPrompt(batch, category);

      try {
        const response = await callClaude(prompt);
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.error("Failed to parse AI response as JSON");
          continue;
        }

        const results: SummarizedItem[] = JSON.parse(jsonMatch[0]);

        for (const result of results) {
          const status = result.reject ? "rejected" : "processed";
          await supabase
            .from("news_items")
            .update({
              summary: result.summary,
              implication: result.implication,
              relevance_score: result.relevance_score,
              status,
              processed_at: new Date().toISOString(),
            })
            .eq("id", result.id);
          processed++;
        }
      } catch (err) {
        console.error(`Error summarizing ${category} batch:`, err);
      }

      // Pause between Claude calls to avoid rate-limit spikes
      if (i + BATCH_SIZE < items.length) await sleep(1000);
    }

    await sleep(1000);
  }

  if (totalFetched === 0) {
    console.log("No raw items to summarize");
  } else {
    console.log(`Summarized ${processed}/${totalFetched} items`);
  }
  return totalFetched;
}

export async function detectCompetitors(): Promise<void> {
  const clients = await getActiveClients();
  const clientsWithoutCompetitors = clients.filter(
    (c) => !c.competitors?.length
  );

  if (!clientsWithoutCompetitors.length) {
    console.log("All clients already have competitors assigned");
    return;
  }

  console.log(
    `Detecting competitors for ${clientsWithoutCompetitors.length} clients...`
  );

  const clientList = clientsWithoutCompetitors
    .map((c) => `- ${c.company_name} (индустрия: ${c.industry || "неизвестна"})`)
    .join("\n");

  const prompt = `Ты — аналитик рынка. Для каждой компании из списка определи 3-5 основных конкурентов на российском рынке.

Компании:
${clientList}

Верни ответ СТРОГО в формате JSON:
{
  "CompanyName": ["Конкурент1", "Конкурент2", "Конкурент3"],
  ...
}

Используй только реально существующие компании. Если не уверен в конкурентах — укажи самых очевидных по индустрии.`;

  try {
    const response = await callClaude(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const competitorsMap: Record<string, string[]> = JSON.parse(jsonMatch[0]);

    for (const client of clientsWithoutCompetitors) {
      const competitors = competitorsMap[client.company_name];
      if (competitors?.length) {
        await supabase
          .from("clients")
          .update({ competitors })
          .eq("company_name", client.company_name);
        console.log(
          `  ${client.company_name}: ${competitors.join(", ")}`
        );
      }
    }
  } catch (err) {
    console.error("Error detecting competitors:", err);
  }
}

export async function markReadyItems(): Promise<number> {
  // Mark processed items with good relevance as ready for digest
  const { data, error } = await supabase
    .from("news_items")
    .update({ status: "ready" })
    .eq("status", "processed")
    .gte("relevance_score", 0.4)
    .select("id");

  const count = data?.length || 0;
  console.log(`Marked ${count} items as ready for digest`);
  return count;
}
