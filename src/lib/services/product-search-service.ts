import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult } from "../analysis-types";
import type { UploadedImage } from "../upload";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
// 1 Treffer als "Original", 3 weitere als eigenständige Alternativen.
const MIN_PRICED_MATCHES = 4;

/** true, sobald SERPAPI_KEY gesetzt ist. */
export function isProductSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

type LensVisualMatch = {
  title?: string;
  source?: string;
  price?: { extracted_value?: number };
};

type PricedMatch = {
  title: string;
  source?: string;
  price: { extracted_value: number };
};

type GPTRefinement = {
  originalIndex: number;
  bestIndex: number;
  cheapestIndex: number;
  premiumIndex: number;
  productName: string;
  brand: string;
  category: string;
  confidence: number;
};

/**
 * Echte Bildsuche über SerpAPI Google Lens, optional verfeinert durch GPT.
 *
 * Das Foto wird kurz über Vercel Blob öffentlich gehostet (SerpAPI benötigt
 * eine öffentliche URL) und direkt danach wieder gelöscht.
 *
 * Wenn OPENAI_API_KEY gesetzt ist und mind. MIN_PRICED_MATCHES preisgelistete
 * Treffer vorliegen, wird GPT-4o-mini zur Auswertung hinzugezogen. Schlägt
 * der GPT-Aufruf fehl, greift die Heuristik als Fallback ein.
 */
export async function searchWithGoogleLens(
  image: UploadedImage,
): Promise<AnalysisResult | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  let blobUrl: string | null = null;

  try {
    const extension =
      image.mimeType === "image/png"
        ? "png"
        : image.mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const blob = await put(
      `spotted-scans/${Date.now()}.${extension}`,
      image.buffer,
      { access: "private", contentType: image.mimeType },
    );
    blobUrl = blob.url;

    // The store is private-only so we need a presigned GET URL that SerpAPI
    // (and GPT vision) can access without authentication headers.
    const validUntil = Date.now() + 3 * 60 * 1000; // 3 minutes
    const signedToken = await issueSignedToken({
      pathname: blob.pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl: imageUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname: blob.pathname,
      access: "private",
      validUntil,
    });

    const url = new URL(SERPAPI_ENDPOINT);
    url.searchParams.set("engine", "google_lens");
    url.searchParams.set("url", imageUrl);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(
        `SerpAPI Google Lens antwortete mit HTTP ${response.status}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      visual_matches?: LensVisualMatch[];
    };
    const matches = data.visual_matches ?? [];

    const priced = matches.filter(
      (m): m is PricedMatch =>
        typeof m.price?.extracted_value === "number" && Boolean(m.title),
    );

    const useGPT =
      Boolean(process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY) &&
      priced.length >= MIN_PRICED_MATCHES;

    const result = useGPT
      ? ((await refineWithOpenAI(imageUrl, priced)) ??
        buildResultFromPriced(priced))
      : buildResultFromPriced(priced);

    if (result) {
      const suffix = useGPT ? ", GPT-verfeinert" : "";
      console.log(
        `[searchWithGoogleLens] Live-Treffer: "${result.originalProduct.name}" (${matches.length} visual_matches${suffix}).`,
      );
    } else {
      console.log(
        `[searchWithGoogleLens] Zu wenige preisgelistete Treffer (${matches.length} visual_matches insgesamt) - kein echtes Ergebnis.`,
      );
    }

    return result;
  } finally {
    if (blobUrl) {
      await del(blobUrl).catch((err) => {
        console.error("Konnte temporären Blob nicht löschen:", err);
      });
    }
  }
}

async function refineWithOpenAI(
  imageUrl: string,
  priced: PricedMatch[],
): Promise<AnalysisResult | null> {
  // Accept both the canonical name and the common typo variant.
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
  if (!apiKey) return null;

  const matchList = priced.map((m, i) => ({
    index: i,
    title: m.title,
    store: m.source ?? "Unknown",
    price: m.price.extracted_value,
  }));

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageUrl, detail: "low" },
              },
              {
                type: "text",
                text: [
                  "You analyze a product photo for a price comparison app.",
                  `Google Lens results: ${JSON.stringify(matchList)}`,
                  "",
                  'Return JSON: {"originalIndex":0,"bestIndex":1,"cheapestIndex":2,"premiumIndex":3,"productName":"Nike Air Max 97","brand":"Nike","category":"Schuhe","confidence":82}',
                  "",
                  "Rules:",
                  "- originalIndex: best visual match for the product shown in the image",
                  "- bestIndex: best value-for-money alternative (different from originalIndex)",
                  "- cheapestIndex: lowest price (different from originalIndex and bestIndex)",
                  "- premiumIndex: highest quality/price (different from all others)",
                  "- All four indices must be different from each other",
                  "- productName: clean name without store/size/color info",
                  "- category must be one of: Schuhe, Hoodie, Shirt, Jacke, Hose, Uhr, Tasche, Gürtel, Brille, Kleid, Produkt",
                  "- confidence: integer 50-95",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "(body unreadable)");
      console.error(
        `[refineWithOpenAI] HTTP ${response.status}: ${body.slice(0, 400)}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const gpt = JSON.parse(content) as GPTRefinement;

    const indices = [
      gpt.originalIndex,
      gpt.bestIndex,
      gpt.cheapestIndex,
      gpt.premiumIndex,
    ];

    if (
      indices.some(
        (i) => typeof i !== "number" || i < 0 || i >= priced.length,
      )
    ) {
      console.error("[refineWithOpenAI] GPT lieferte ungültige Indices:", gpt);
      return null;
    }

    if (new Set(indices).size < 4) {
      console.warn(
        "[refineWithOpenAI] GPT lieferte doppelte Indices, Heuristik-Fallback.",
      );
      return null;
    }

    const original = priced[gpt.originalIndex];
    const best = priced[gpt.bestIndex];
    const cheapest = priced[gpt.cheapestIndex];
    const premium = priced[gpt.premiumIndex];
    const prices = priced.map((m) => m.price.extracted_value);

    const brand = gpt.brand?.trim() || guessBrand(original.title);
    const category = gpt.category?.trim() || guessCategory(original.title);

    const toAlternative = (
      match: PricedMatch,
      role: AlternativeProduct["role"],
    ): AlternativeProduct => ({
      role,
      name: match.title.trim(),
      store: match.source ?? "Unbekannter Shop",
      price: match.price.extracted_value,
      savingsPercent: Math.max(
        0,
        Math.round(
          (1 -
            match.price.extracted_value / original.price.extracted_value) *
            100,
        ),
      ),
    });

    return {
      originalProduct: {
        name: gpt.productName?.trim() || cleanTitle(original.title),
        brand,
        store: original.source ?? "Unbekannter Shop",
        price: original.price.extracted_value,
      },
      brand,
      category,
      confidence: Math.min(95, Math.max(50, Math.round(gpt.confidence ?? 70))),
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      alternatives: {
        best: toAlternative(best, "best"),
        cheapest: toAlternative(cheapest, "cheapest"),
        premium: toAlternative(premium, "premium"),
      },
    };
  } catch (error) {
    console.error("[refineWithOpenAI] Fehler:", error);
    return null;
  }
}

function buildResultFromPriced(priced: PricedMatch[]): AnalysisResult | null {
  if (priced.length < MIN_PRICED_MATCHES) return null;

  // Erster Treffer = höchste visuelle Ähnlichkeit laut Google Lens → "Original".
  // Alternativen aus dem Rest, um Doppelungen zu vermeiden.
  const [original, ...rest] = priced;
  const sortedByPrice = [...rest].sort(
    (a, b) => a.price.extracted_value - b.price.extracted_value,
  );

  const cheapest = sortedByPrice[0];
  const premium = sortedByPrice[sortedByPrice.length - 1];
  const best = sortedByPrice[Math.floor(sortedByPrice.length / 2)];
  const prices = priced.map((m) => m.price.extracted_value);

  const toAlternative = (
    match: PricedMatch,
    role: AlternativeProduct["role"],
  ): AlternativeProduct => ({
    role,
    name: cleanTitle(match.title),
    store: match.source ?? "Unbekannter Shop",
    price: match.price.extracted_value,
    savingsPercent: Math.max(
      0,
      Math.round(
        (1 - match.price.extracted_value / original.price.extracted_value) *
          100,
      ),
    ),
  });

  const brand = guessBrand(original.title);
  const category = guessCategory(original.title);

  return {
    originalProduct: {
      name: cleanTitle(original.title),
      brand,
      store: original.source ?? "Unbekannter Shop",
      price: original.price.extracted_value,
    },
    brand,
    category,
    confidence: Math.min(95, 50 + priced.length * 5),
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    alternatives: {
      best: toAlternative(best, "best"),
      cheapest: toAlternative(cheapest, "cheapest"),
      premium: toAlternative(premium, "premium"),
    },
  };
}

/** Wrapper für Aufrufe mit dem alten LensVisualMatch[]-Interface. */
function buildResultFromMatches(
  matches: LensVisualMatch[],
): AnalysisResult | null {
  const priced = matches.filter(
    (m): m is PricedMatch =>
      typeof m.price?.extracted_value === "number" && Boolean(m.title),
  );
  return buildResultFromPriced(priced);
}

// Wird von buildResultFromMatches indirekt aufgerufen — export verhindert
// "unused" TS-Warnung falls die Funktion später aus route.ts genutzt wird.
export { buildResultFromMatches };

/**
 * Nur Whitespace-Trimming: gescrapte Google-Lens-Titel enthalten manchmal
 * Shop-Namen oder Größen, aber ein Trennzeichen-Schnitt riskiert, die Marke
 * mit abzuschneiden. Sauberes Umformulieren ist Aufgabe von GPT (Step 4).
 */
function cleanTitle(title: string): string {
  return title.trim();
}

const KNOWN_BRANDS = [
  "Adidas Originals",
  "Adidas",
  "Nike",
  "Puma",
  "Reebok",
  "New Balance",
  "Converse",
  "Vans",
  "Levi's",
  "Levis",
  "Tommy Hilfiger",
  "Calvin Klein",
  "Ralph Lauren",
  "Lacoste",
  "Hugo Boss",
  "Boss",
  "Zara",
  "H&M",
  "Uniqlo",
  "Mango",
  "COS",
  "Arket",
  "Gucci",
  "Prada",
  "Louis Vuitton",
  "Chanel",
  "Dior",
  "Balenciaga",
  "Versace",
  "Burberry",
  "The North Face",
  "Patagonia",
  "Carhartt",
  "Champion",
  "Fila",
  "Under Armour",
  "Daniel Wellington",
  "Fossil",
  "Casio",
  "Swatch",
  "Garmin",
  "Apple",
  "Marc O'Polo",
  "Filippa K",
  "Acne Studios",
  "Stüssy",
  "Supreme",
] as const;

function guessBrand(title: string): string {
  const lower = title.toLowerCase();
  const match = KNOWN_BRANDS.find((brand) =>
    lower.includes(brand.toLowerCase()),
  );
  if (match) return match;
  return title.trim().split(/\s+/)[0] || "Unbekannt";
}

function guessCategory(title: string): string {
  const text = title.toLowerCase();
  if (/sneaker|schuh|shoe|stiefel|boot|sandale/.test(text)) return "Schuhe";
  if (/hoodie|pullover|sweatshirt/.test(text)) return "Hoodie";
  if (/t-shirt|shirt|top/.test(text)) return "Shirt";
  if (/jacke|jacket|mantel|coat|parka/.test(text)) return "Jacke";
  if (/hose|jeans|pants|trousers|chino/.test(text)) return "Hose";
  if (/uhr|watch/.test(text)) return "Uhr";
  if (/tasche|bag|rucksack|backpack/.test(text)) return "Tasche";
  if (/gürtel|guertel|belt/.test(text)) return "Gürtel";
  if (/brille|sunglasses|glasses/.test(text)) return "Brille";
  if (/kleid|dress/.test(text)) return "Kleid";
  return "Produkt";
}
