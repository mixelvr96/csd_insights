import type { DigestData, DigestSection } from "./builder.js";
import { CATEGORIES } from "../config.js";

interface AdaptiveCardElement {
  type: string;
  [key: string]: any;
}

function itemCount(n: number): string {
  if (n === 1) return "1 новость";
  if (n >= 2 && n <= 4) return `${n} новости`;
  return `${n} новостей`;
}

export function formatDigestForTeams(digest: DigestData, driveUrl?: string): object {
  const bodyElements: AdaptiveCardElement[] = [
    // Header
    {
      type: "TextBlock",
      text: "📰 ZORKA NEWS DIGEST",
      size: "extraLarge",
      weight: "bolder",
      horizontalAlignment: "center",
    },
    {
      type: "TextBlock",
      text: digest.date,
      size: "small",
      horizontalAlignment: "center",
      isSubtle: true,
      spacing: "none",
    },
    {
      type: "TextBlock",
      text: " ",
      spacing: "small",
    },
  ];

  // One row per section
  for (const section of digest.sections) {
    bodyElements.push({
      type: "ColumnSet",
      spacing: "small",
      columns: [
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "TextBlock",
              text: `${section.emoji} **${section.label}**`,
              size: "small",
              wrap: true,
            },
          ],
        },
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "TextBlock",
              text: itemCount(section.items.length),
              size: "small",
              isSubtle: true,
              horizontalAlignment: "right",
            },
          ],
        },
      ],
    });
  }

  // Total
  bodyElements.push({
    type: "TextBlock",
    text: `Итого: **${digest.totalItems}** новостей`,
    size: "small",
    horizontalAlignment: "right",
    isSubtle: true,
    spacing: "small",
  });

  // Footer
  bodyElements.push({
    type: "TextBlock",
    text: "_Автоматическая сводка от CSD Insights_",
    size: "small",
    horizontalAlignment: "center",
    isSubtle: true,
    spacing: "large",
  });

  // Drive button
  if (driveUrl) {
    bodyElements.push({
      type: "ActionSet",
      spacing: "medium",
      actions: [
        {
          type: "Action.OpenUrl",
          title: "📊 Открыть презентацию",
          url: driveUrl,
          style: "positive",
        },
      ],
    });
  }

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: bodyElements,
        },
      },
    ],
  };
}

// Fallback: simple markdown format
export function formatDigestAsMarkdown(digest: DigestData): string {
  let md = `# 📰 ZORKA NEWS DIGEST\n`;
  md += `**${digest.date}** | ${digest.totalItems} новостей\n\n`;

  for (const section of digest.sections) {
    md += `---\n## ${section.emoji} ${section.label}\n\n`;
    const showImplication = section.category !== CATEGORIES.ZORKA_AGENCY;

    for (const item of section.items) {
      md += `**${item.title}**\n`;
      if (item.summary) md += `${item.summary}\n`;
      if (showImplication && item.implication) {
        md += `> 💡 *Что это значит для вас:* ${item.implication}\n`;
      }
      if (item.related_entity) md += `📌 ${item.related_entity}\n`;
      md += `[Источник →](${item.url})\n\n`;
    }
  }

  md += `---\n_Автоматическая сводка от CSD Insights_\n`;
  return md;
}
