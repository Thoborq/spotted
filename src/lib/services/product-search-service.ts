import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult } from "../analysis-types";
import type { UploadedImage } from "../upload";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MIN_EU_MATCHES = 4;
const MAX_GPT_MATCHES = 12;
const GPT_TIMEOUT_MS = 9000;

// ---------------------------------------------------------------------------
// EU eligibility: EUR-only, no US/non-EU shops, no fallback.
// ---------------------------------------------------------------------------

const EU_TLD = /\.(de|at|ch|nl|fr|it|es|be|dk|se|fi|pl|pt|ie|eu)\b/;

// Known EU shops that may use .com domains but ship to DE/EU with EUR prices.
const KNOWN_EU_SHOP_SOURCES = [
  "zalando", "about you", "aboutyou",
  "breuninger", "peek & cloppenburg", "peek cloppenburg",
  "mytheresa", "luisaviaroma", "luisa via roma",
  "farfetch", "end.", "end clothing", "ssense",
  "mr porter", "mrporter", "net-a-porter", "netaporter", "yoox",
  "bstn", "solebox", "hhv", "snipes", "asphaltgold", "43einhalb",
  "foot locker", "footlocker", "jd sports",
  "footshop", "sizeer", "footpatrol", "overkill",
  "deichmann", "görtz", "goertz", "humanic",
  "planet sports", "intersport", "decathlon",
  "galeries lafayette", "el corte ingles", "la redoute",
  "asos", "c&a",
];

// Hard-excluded — never show these regardless of currency.
const EXCLUDED_SHOP_SOURCES = [
  "walmart", "target", "macy", "nordstrom",
  "kohls", "kohl's", "jcpenney", "sears", "belk", "dillards",
  "tj maxx", "tjmaxx", "ross ", "bloomingdale", "neiman marcus",
  "saks fifth", "footaction", "champs sports",
  "dick's sporting", "academy sports",
];

function isEUEligible(m: PricedMatch): boolean {
  // EUR price is a hard requirement — no exceptions.
  if (m.price.currency !== "€") return false;

  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();

  // Hard-exclude known non-EU shops.
  if (EXCLUDED_SHOP_SOURCES.some((s) => src.includes(s) || href.includes(s.replace(/ /g, "")))) {
    return false;
  }

  // Everything else with an EUR price passes (gl=de makes non-EU EUR prices rare).
  return true;
}

// ---------------------------------------------------------------------------
// Shop priority scoring.
// Priority: official brand EU > German shops > DACH/EU TLD > premium intl.
// Farfetch and similar are Tier 6 (premium intl.) — they should NOT dominate.
// ---------------------------------------------------------------------------

const OFFICIAL_BRAND_DOMAINS = [
  "nike", "adidas", "puma", "reebok", "newbalance", "new-balance",
  "converse", "vans", "tommy", "calvinklein", "ralphlauren", "lacoste",
  "hugoboss", "zara", "uniqlo", "mango", "gucci", "prada",
  "louisvuitton", "dior", "balenciaga", "versace", "burberry",
  "thenorthface", "patagonia", "apple", "samsung", "sony",
  "levi", "gap", "hm", "cos", "arket", "filippa",
];

const GERMAN_SHOPS = [
  "zalando", "about you", "aboutyou", "breuninger",
  "peek & cloppenburg", "peek cloppenburg",
  "snipes", "bstn", "solebox", "hhv",
  "asphaltgold", "43einhalb", "footpatrol", "overkill",
  "planet sports", "görtz", "goertz", "deichmann",
  "foot locker", "footlocker", "jd sports",
];

// Premium shops that ship to EU — valid, but lower priority than DE/brand stores.
const PREMIUM_EU_INTL = [
  "farfetch", "mytheresa", "ssense",
  "mr porter", "mrporter", "net-a-porter", "netaporter",
  "yoox", "luisaviaroma", "luisa via roma",
  "end.", "end clothing",
];

function shopScore(m: PricedMatch): number {
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();

  // Tier 1 (90): Official brand's own German/EU domain (e.g. adidas.de, nike.com/de)
  const isBrand = OFFICIAL_BRAND_DOMAINS.some((d) => href.includes(d));
  if (isBrand) {
    if (/\.de\b/.test(href) || /\.com\/(de|eu|at|ch)/.test(href)) return 90;
    return 50; // brand .com without a DE/EU path
  }

  // Tier 2 (80): Established German shops
  if (GERMAN_SHOPS.some((s) => src.includes(s))) return 80;

  // Tier 3 (60): Any .de domain
  if (/\.de\b/.test(href)) return 60;

  // Tier 4 (50): DACH — Austria, Switzerland
  if (/\.(at|ch)\b/.test(href)) return 50;

  // Tier 5 (40): Other EU TLDs
  if (EU_TLD.test(href)) return 40;

  // Tier 6 (30): Premium shops with EU shipping (Farfetch, Mytheresa, SSENSE, …)
  if (PREMIUM_EU_INTL.some((s) => src.includes(s))) return 30;

  // Tier 7 (10): Unknown EUR shop (benefit of the doubt — gl=de already narrows results)
  return 10;
}

/** true, sobald SERPAPI_KEY gesetzt ist. */
export function isProductSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

type LensVisualMatch = {
  title?: string;
  source?: string;
  link?: string;
  thumbnail?: string;
  image?: string;
  price?: { extracted_value?: number; currency?: string };
};

type PricedMatch = {
  title: string;
  source?: string;
  link?: string;
  thumbnail?: string;
  image?: string;
  price: { extracted_value: number; currency?: string };
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
 * Echte Bildsuche über SerpAPI Google Lens.
 *
 * Rückgabewerte:
 *   AnalysisResult — Treffer mit ≥4 seriösen EU-Shops (EUR-Preise)
 *   "no_eu_shop"   — SerpAPI fand Treffer, aber keiner erfüllt EU-Kriterien
 *   null           — Fehler oder zu wenige Gesamttreffer
 */
export async function searchWithGoogleLens(
  image: UploadedImage,
): Promise<AnalysisResult | null | "no_eu_shop"> {
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

    const validUntil = Date.now() + 3 * 60 * 1000;
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
    url.searchParams.set("hl", "de");
    url.searchParams.set("gl", "de");

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`SerpAPI Google Lens antwortete mit HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      visual_matches?: LensVisualMatch[];
    };
    const matches = data.visual_matches ?? [];

    const rawPriced = matches.filter(
      (m): m is PricedMatch =>
        typeof m.price?.extracted_value === "number" && Boolean(m.title),
    );

    // Strict EU filter: EUR-only, no US shops. No fallback to non-EUR.
    const euPriced = rawPriced.filter(isEUEligible);

    if (rawPriced.length >= MIN_EU_MATCHES && euPriced.length < MIN_EU_MATCHES) {
      console.log(
        `[searchWithGoogleLens] ${rawPriced.length} Preiseinträge, aber nur ${euPriced.length} EU-geeignet → no_eu_shop.`,
      );
      return "no_eu_shop";
    }

    if (euPriced.length < MIN_EU_MATCHES) {
      console.log(
        `[searchWithGoogleLens] Zu wenige EU-Treffer: ${euPriced.length}/${rawPriced.length} von ${matches.length} gesamt.`,
      );
      return null;
    }

    // Sort by shop quality — best EU shop first.
    const sorted = [...euPriced].sort((a, b) => shopScore(b) - shopScore(a));

    const useGPT =
      Boolean(process.env.OPENAI_API_KEY) && sorted.length >= MIN_EU_MATCHES;

    let gptResult: AnalysisResult | null = null;
    if (useGPT) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const gptTimeoutPromise = new Promise<null>(
        (resolve) => { timeoutId = setTimeout(() => resolve(null), GPT_TIMEOUT_MS); },
      );
      gptResult = await Promise.race([
        refineWithOpenAI(imageUrl, sorted.slice(0, MAX_GPT_MATCHES)),
        gptTimeoutPromise,
      ]);
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (gptResult === null) {
        console.warn(
          `[searchWithGoogleLens] GPT-Timeout nach ${GPT_TIMEOUT_MS}ms – Heuristik-Fallback.`,
        );
      }
    }

    const result = gptResult ?? buildResultFromPriced(sorted);

    if (result) {
      const suffix = gptResult
        ? ", GPT-verfeinert"
        : useGPT
          ? ", GPT-Timeout → Heuristik"
          : "";
      console.log(
        `[searchWithGoogleLens] "${result.originalProduct.name}" – ${euPriced.length} EU-Treffer von ${matches.length} gesamt${suffix}.`,
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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const matchList = priced.map((m, i) => ({
    index: i,
    title: m.title,
    store: m.source ?? "Unknown",
    price: m.price.extracted_value,
    currency: m.price.currency ?? "€",
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
                  "You analyze a product photo for a German price comparison app.",
                  `Candidates (pre-sorted by EU shop quality, all EUR prices, all ship to Germany): ${JSON.stringify(matchList)}`,
                  "",
                  'Return JSON: {"originalIndex":0,"bestIndex":1,"cheapestIndex":2,"premiumIndex":3,"productName":"Nike Air Max 97","brand":"Nike","category":"Schuhe","confidence":82}',
                  "",
                  "Rules:",
                  "- originalIndex: best visual match for the product in the image",
                  "- bestIndex: best value from a German/brand shop (prefer Zalando, About You, Breuninger, official brand sites like adidas.com or adidas.de)",
                  "- cheapestIndex: lowest EUR price (must differ from original and best)",
                  "- premiumIndex: premium option — Farfetch, Mytheresa, SSENSE, or Mr Porter preferred (must differ from all others)",
                  "- All four indices MUST be different from each other",
                  "- productName: clean brand + product name only, no store/size/color info",
                  "- category: one of Schuhe, Hoodie, Shirt, Jacke, Hose, Uhr, Tasche, Gürtel, Brille, Kleid, Produkt",
                  "- confidence: integer 50–95",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `[refineWithOpenAI] OpenAI API antwortete mit HTTP ${response.status}`,
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

    if (indices.some((i) => typeof i !== "number" || i < 0 || i >= priced.length)) {
      console.error("[refineWithOpenAI] GPT lieferte ungültige Indices:", gpt);
      return null;
    }

    if (new Set(indices).size < 4) {
      console.warn("[refineWithOpenAI] GPT lieferte doppelte Indices, Heuristik-Fallback.");
      return null;
    }

    const original = priced[gpt.originalIndex];
    const best = priced[gpt.bestIndex];
    const cheapest = priced[gpt.cheapestIndex];
    const premium = priced[gpt.premiumIndex];
    const prices = priced.map((m) => m.price.extracted_value);
    const anyThumb =
      priced.find((m) => m.image ?? m.thumbnail)?.image ??
      priced.find((m) => m.thumbnail)?.thumbnail;

    const brand = gpt.brand?.trim() || guessBrand(original.title);
    const category = gpt.category?.trim() || guessCategory(original.title);
    const bestImg = (m: PricedMatch) => m.image ?? m.thumbnail ?? anyThumb;

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
          (1 - match.price.extracted_value / original.price.extracted_value) * 100,
        ),
      ),
      imageUrl: bestImg(match),
      link: match.link,
      shipsFromNonEU: false,
    });

    return {
      originalProduct: {
        name: gpt.productName?.trim() || cleanTitle(original.title),
        brand,
        store: original.source ?? "Unbekannter Shop",
        price: original.price.extracted_value,
        imageUrl: bestImg(original),
        link: original.link,
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
  if (priced.length < MIN_EU_MATCHES) return null;

  // priced is sorted by shop quality; first entry is the best EU match.
  const [original, ...rest] = priced;
  const sortedByPrice = [...rest].sort(
    (a, b) => a.price.extracted_value - b.price.extracted_value,
  );

  const cheapest = sortedByPrice[0];
  const premium = sortedByPrice[sortedByPrice.length - 1];
  const best = sortedByPrice[Math.floor(sortedByPrice.length / 2)];
  const prices = priced.map((m) => m.price.extracted_value);
  const anyThumb =
    priced.find((m) => m.image ?? m.thumbnail)?.image ??
    priced.find((m) => m.thumbnail)?.thumbnail;

  const bestImg = (m: PricedMatch) => m.image ?? m.thumbnail ?? anyThumb;

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
        (1 - match.price.extracted_value / original.price.extracted_value) * 100,
      ),
    ),
    imageUrl: bestImg(match),
    link: match.link,
    shipsFromNonEU: false,
  });

  const brand = guessBrand(original.title);
  const category = guessCategory(original.title);

  return {
    originalProduct: {
      name: cleanTitle(original.title),
      brand,
      store: original.source ?? "Unbekannter Shop",
      price: original.price.extracted_value,
      imageUrl: bestImg(original),
      link: original.link,
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

export { buildResultFromMatches };

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
