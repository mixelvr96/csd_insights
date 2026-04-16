import "dotenv/config";
import pptxgen from "pptxgenjs";
const PptxGenJS = (pptxgen as any).default || pptxgen;
import { createClient } from "@supabase/supabase-js";
import { CATEGORIES } from "../config.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { uploadToDrive } from "../utils/google-drive.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Zorka brand colors
const COLORS = {
  bg: "0F0F0F",
  bgCard: "1A1A1A",
  lime: "D1F453",
  yellow: "FCCD03",
  purple: "7721EC",
  white: "FFFFFF",
  textMuted: "BFBFBF",
  textDim: "888888",
  border: "2E2E2E",
};

const SECTION_CONFIG: Record<string, { label: string; emoji: string; color: string; maxItems: number }> = {
  [CATEGORIES.ZORKA_AGENCY]: { label: "НОВОСТИ ЗОРКИ", emoji: "🏢", color: COLORS.lime, maxItems: 3 },
  [CATEGORIES.INDUSTRY]: { label: "ИНДУСТРИЯ", emoji: "📊", color: COLORS.yellow, maxItems: 5 },
  [CATEGORIES.RESEARCH]: { label: "ИССЛЕДОВАНИЯ РЫНКА", emoji: "📈", color: COLORS.yellow, maxItems: 3 },
  [CATEGORIES.VERTICAL]: { label: "ВЕРТИКАЛИ КЛИЕНТОВ", emoji: "🏭", color: COLORS.purple, maxItems: 5 },
  [CATEGORIES.CLIENT]: { label: "НОВОСТИ КЛИЕНТОВ", emoji: "👥", color: COLORS.lime, maxItems: 5 },
  [CATEGORIES.COMPETITOR]: { label: "КОНКУРЕНТЫ КЛИЕНТОВ", emoji: "🔍", color: COLORS.purple, maxItems: 5 },
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, "").replace(/\s+/g, " ").trim();
}

function isSimilar(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size > 0.35;
}

export async function generateAndUploadPptx(): Promise<string | null> {
  return main();
}

async function main(): Promise<string | null> {
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const today = new Date().toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" });

  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5

  // Logo path
  const logoPath = "/Users/viktorryzhov/Desktop/Vibecoding_Viktor/Zorka.ru_NEW/public/images/Zorka_White_ru.png";

  // ===== TITLE SLIDE =====
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: COLORS.bg };

  // Logo
  titleSlide.addImage({
    path: logoPath,
    x: 0.5,
    y: 0.5,
    w: 2.0,
    h: 0.41,
  });

  // Title
  titleSlide.addText("НОВОСТНОЙ ДАЙДЖЕСТ", {
    x: 0.5,
    y: 2.0,
    w: 12,
    h: 1.5,
    fontSize: 54,
    fontFace: "Montserrat",
    color: COLORS.white,
    bold: true,
  });

  // Date & subtitle
  titleSlide.addText(today, {
    x: 0.5,
    y: 3.5,
    w: 12,
    h: 0.6,
    fontSize: 22,
    fontFace: "Montserrat",
    color: COLORS.lime,
  });

  titleSlide.addText("Автоматическая новостная сводка от «Зорки» для CSD-команды", {
    x: 0.5,
    y: 4.2,
    w: 12,
    h: 0.5,
    fontSize: 16,
    fontFace: "Montserrat",
    color: COLORS.textMuted,
  });

  // Decorative lime line
  titleSlide.addShape(pptx.ShapeType.rect, {
    x: 0.5,
    y: 1.8,
    w: 2.5,
    h: 0.05,
    fill: { color: COLORS.lime },
  });

  // ===== CONTENT SLIDES =====
  const allSelected: { title: string }[] = [];

  for (const [category, cfg] of Object.entries(SECTION_CONFIG)) {
    const { data: candidates } = await sb
      .from("news_items")
      .select("*")
      .eq("category", category)
      .eq("status", "ready")
      .gte("published_at", twoWeeksAgo)
      .order("relevance_score", { ascending: false })
      .limit(cfg.maxItems * 3);

    if (!candidates?.length) continue;

    const items: typeof candidates = [];
    for (const c of candidates) {
      if (items.length >= cfg.maxItems) break;
      const isDup = [...items, ...allSelected].some((ex) => isSimilar(ex.title, c.title));
      if (!isDup) items.push(c);
    }
    if (!items.length) continue;
    allSelected.push(...items);

    // Section title slide
    const sectionSlide = pptx.addSlide();
    sectionSlide.background = { color: COLORS.bg };

    sectionSlide.addImage({ path: logoPath, x: 0.5, y: 0.3, w: 1.5, h: 0.31 });

    // Colored accent bar
    sectionSlide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 2.8,
      w: 13.33,
      h: 0.06,
      fill: { color: cfg.color },
    });

    sectionSlide.addText(cfg.label, {
      x: 0.5,
      y: 3.0,
      w: 12,
      h: 1.2,
      fontSize: 40,
      fontFace: "Montserrat",
      color: cfg.color,
      bold: true,
    });

    sectionSlide.addText(`${items.length} ${items.length === 1 ? "новость" : items.length < 5 ? "новости" : "новостей"}`, {
      x: 0.5,
      y: 4.2,
      w: 12,
      h: 0.5,
      fontSize: 18,
      fontFace: "Montserrat",
      color: COLORS.textDim,
    });

    // News items — 2 per slide
    for (let i = 0; i < items.length; i += 2) {
      const slide = pptx.addSlide();
      slide.background = { color: COLORS.bg };

      // Header bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.06,
        fill: { color: cfg.color },
      });

      slide.addText(cfg.label, {
        x: 0.5,
        y: 0.2,
        w: 10,
        h: 0.4,
        fontSize: 12,
        fontFace: "Montserrat",
        color: cfg.color,
        bold: true,
      });

      slide.addImage({ path: logoPath, x: 11.0, y: 0.15, w: 1.5, h: 0.31 });

      // Render up to 2 items per slide
      const batch = items.slice(i, i + 2);
      batch.forEach((item, idx) => {
        const yBase = idx === 0 ? 0.9 : 4.2;
        const showImplication = category !== CATEGORIES.ZORKA_AGENCY;

        // Card background
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.4,
          y: yBase - 0.1,
          w: 12.5,
          h: 2.9,
          fill: { color: COLORS.bgCard },
          rectRadius: 0.1,
        });

        // Title
        slide.addText(item.title, {
          x: 0.7,
          y: yBase,
          w: 11.9,
          h: 0.7,
          fontSize: 17,
          fontFace: "Montserrat",
          color: COLORS.white,
          bold: true,
          valign: "top",
        });

        // Summary
        if (item.summary) {
          slide.addText(item.summary, {
            x: 0.7,
            y: yBase + 0.7,
            w: 11.9,
            h: 0.8,
            fontSize: 12,
            fontFace: "Montserrat",
            color: COLORS.textMuted,
            valign: "top",
          });
        }

        // Implication — split "Для агентства" and "Для клиентов"
        if (showImplication && item.implication) {
          const parts: any[] = [];
          const impl = item.implication as string;
          const agencyMatch = impl.match(/Для агентства:\s*(.*?)(?=Для клиентов:|$)/s);
          const clientMatch = impl.match(/Для клиентов:\s*(.*?)$/s);

          if (agencyMatch || clientMatch) {
            if (agencyMatch) {
              parts.push({ text: "Для агентства: ", options: { color: COLORS.lime, bold: true, fontSize: 10 } });
              parts.push({ text: agencyMatch[1].trim() + "\n", options: { color: COLORS.textMuted, fontSize: 10 } });
            }
            if (clientMatch) {
              parts.push({ text: "Для клиентов: ", options: { color: COLORS.yellow, bold: true, fontSize: 10 } });
              parts.push({ text: clientMatch[1].trim(), options: { color: COLORS.textMuted, fontSize: 10 } });
            }
          } else {
            parts.push({ text: "💡 ", options: { color: COLORS.yellow, fontSize: 10 } });
            parts.push({ text: impl, options: { color: COLORS.textMuted, fontSize: 10 } });
          }

          slide.addText(parts, {
            x: 0.7,
            y: yBase + 1.5,
            w: 11.9,
            h: 0.7,
            fontFace: "Montserrat",
            valign: "top",
          });
        }

        // Footer: entity + source link
        const footerY = yBase + 2.3;
        const footerParts: any[] = [];

        if (item.related_entity) {
          footerParts.push({
            text: `📌 ${item.related_entity}   `,
            options: { color: COLORS.lime, fontSize: 10, bold: true },
          });
        }

        footerParts.push({
          text: "Источник →",
          options: {
            color: COLORS.yellow,
            fontSize: 10,
            hyperlink: { url: item.url },
            underline: { style: "sng" },
          },
        });

        slide.addText(footerParts, {
          x: 0.7,
          y: footerY,
          w: 11.9,
          h: 0.3,
          fontFace: "Montserrat",
        });
      });
    }
  }

  // ===== CLOSING SLIDE =====
  const closingSlide = pptx.addSlide();
  closingSlide.background = { color: COLORS.bg };

  closingSlide.addImage({ path: logoPath, x: 4.5, y: 1.5, w: 4.0, h: 0.82 });

  closingSlide.addShape(pptx.ShapeType.rect, {
    x: 5.0,
    y: 2.8,
    w: 3.33,
    h: 0.05,
    fill: { color: COLORS.lime },
  });

  closingSlide.addText("CSD Insights", {
    x: 0,
    y: 3.2,
    w: 13.33,
    h: 0.8,
    fontSize: 28,
    fontFace: "Montserrat",
    color: COLORS.white,
    align: "center",
  });

  closingSlide.addText("Автоматическая новостная сводка\nОбновляется каждые 2 недели", {
    x: 0,
    y: 4.0,
    w: 13.33,
    h: 1.0,
    fontSize: 16,
    fontFace: "Montserrat",
    color: COLORS.textDim,
    align: "center",
  });

  closingSlide.addText(today, {
    x: 0,
    y: 5.5,
    w: 13.33,
    h: 0.5,
    fontSize: 14,
    fontFace: "Montserrat",
    color: COLORS.lime,
    align: "center",
  });

  // Save locally
  const fileDate = new Date().toISOString().slice(0, 10);
  const outPath = join(__dirname, `../../digest-${fileDate}.pptx`);
  await pptx.writeFile({ fileName: outPath });
  console.log(`\n✅ Presentation saved to: ${outPath}`);

  // Upload to Google Drive
  try {
    const driveUrl = await uploadToDrive(outPath);
    return driveUrl;
  } catch (err) {
    console.error("Failed to upload to Google Drive:", err);
    return null;
  }
}

// Run directly
if (process.argv[1]?.endsWith("generate-pptx.ts") || process.argv[1]?.endsWith("generate-pptx.js")) {
  main().then((url) => {
    if (url) console.log(`\n🔗 Drive link: ${url}`);
    process.exit(0);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
