import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult } from "../analysis-types";
import type { UploadedImage } from "../upload";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MIN_EU_MATCHES = 4;
const MAX_GPT_MATCHES = 12;
const GPT_TIMEOUT_MS = 9000;

// Accept both env-var spellings (OPEN_API_KEY is a known project typo).
function getOpenAIKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;
}

// ---------------------------------------------------------------------------
// Currency normalization
// SerpAPI Lens uses "€"/"$"/"£", Shopping uses "EUR"/"USD"/"GBP".
// Also handles missing currency field (common in Lens visual_matches).
// ---------------------------------------------------------------------------

function normalizeCurrency(raw: string | undefined | null): string {
  if (!raw) return "";
  const up = raw.trim().toUpperCase();
  if (raw.trim() === "€" || up === "EUR") return "€";
  if (raw.trim() === "$" || up === "USD") return "$";
  if (raw.trim() === "£" || up === "GBP") return "£";
  return raw.trim();
}

// ---------------------------------------------------------------------------
// EU eligibility — strict but correct
//
// Accept:  explicit € / EUR currency
//          OR no currency field but link/source is clearly EU
// Reject:  explicit non-EUR currency ($, £, etc.)
//          OR source is in the hard-exclusion list
// ---------------------------------------------------------------------------

const EU_TLD = /\.(de|at|ch|nl|fr|it|es|be|dk|se|fi|pl|pt|ie|eu)\b/;

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
  "c&a", "moncler", "stone island", "cp company", "parajumpers",
];

const EXCLUDED_SHOP_SOURCES = [
  "walmart", "target", "macy", "nordstrom",
  "kohls", "kohl's", "jcpenney", "sears", "belk", "dillards",
  "tj maxx", "tjmaxx", "ross ", "bloomingdale", "neiman marcus",
  "saks fifth", "footaction", "champs sports",
  "dick's sporting", "academy sports",
  "stockx", "goat", "grailed", "depop", "poshmark", "mercari",
  "ebay.com", "amazon.com",
];

const OFFICIAL_BRAND_DOMAINS = [
  "nike", "adidas", "puma", "reebok", "newbalance", "new-balance",
  "converse", "vans", "tommy", "calvinklein", "ralphlauren", "lacoste",
  "hugoboss", "zara", "uniqlo", "mango", "gucci", "prada",
  "louisvuitton", "dior", "balenciaga", "versace", "burberry",
  "thenorthface", "patagonia", "apple", "samsung", "sony",
  "levi", "gap", "cos", "arket", "filippa",
  "cpcompany", "stoneisland", "moncler", "parajumpers", "arcteryx",
];

function isEUEligible(m: PricedMatch): boolean {
  const currency = normalizeCurrency(m.price.currency);
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();

  // Explicit non-EUR currency → always reject.
  if (currency !== "" && currency !== "€") return false;

  // Hard-exclude known non-EU shops regardless of currency.
  if (EXCLUDED_SHOP_SOURCES.some((s) =>
    src.includes(s) || href.includes(s.replace(/ /g, ""))
  )) {
    return false;
  }

  // Explicit EUR → accept.
  if (currency === "€") return true;

  // No currency field: accept only when source is clearly EU.
  if (EU_TLD.test(href)) return true;
  if (KNOWN_EU_SHOP_SOURCES.some((s) => src.includes(s))) return true;
  if (OFFICIAL_BRAND_DOMAINS.some((d) =>
    href.includes(d) && (/\.de\b/.test(href) || /\.com\/(de|eu|at|ch)/.test(href))
  )) return true;

  // Unknown source with no currency → reject (too risky).
  return false;
}

// Why was a match rejected? Returns a short reason string for debug logs.
function euRejectReason(m: PricedMatch): string {
  const currency = normalizeCurrency(m.price.currency);
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();
  if (currency !== "" && currency !== "€") return `currency="${currency}"`;
  if (EXCLUDED_SHOP_SOURCES.some((s) =>
    src.includes(s) || href.includes(s.replace(/ /g, ""))
  )) return "excluded_shop";
  if (currency === "€") return "passes";
  if (EU_TLD.test(href)) return "passes(eu_tld)";
  if (KNOWN_EU_SHOP_SOURCES.some((s) => src.includes(s))) return "passes(known_eu)";
  return "unknown_no_currency";
}

// ---------------------------------------------------------------------------
// Shop priority scoring — 7 tiers + image bonus
// ---------------------------------------------------------------------------

const GERMAN_SHOPS = [
  "zalando", "about you", "aboutyou", "breuninger",
  "peek & cloppenburg", "peek cloppenburg",
  "snipes", "bstn", "solebox", "hhv",
  "asphaltgold", "43einhalb", "footpatrol", "overkill",
  "planet sports", "görtz", "goertz", "deichmann",
  "foot locker", "footlocker", "jd sports",
];

const PREMIUM_EU_INTL = [
  "farfetch", "mytheresa", "ssense",
  "mr porter", "mrporter", "net-a-porter", "netaporter",
  "yoox", "luisaviaroma", "luisa via roma",
  "end.", "end clothing",
];

function shopScore(m: PricedMatch): number {
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();
  const hasImage = Boolean(m.image ?? m.thumbnail);

  let score = 0;
  const isBrand = OFFICIAL_BRAND_DOMAINS.some((d) => href.includes(d));
  if (isBrand) {
    score = /\.de\b/.test(href) || /\.com\/(de|eu|at|ch)/.test(href) ? 90 : 50;
  } else if (GERMAN_SHOPS.some((s) => src.includes(s))) {
    score = 80;
  } else if (/\.de\b/.test(href)) {
    score = 60;
  } else if (/\.(at|ch)\b/.test(href)) {
    score = 50;
  } else if (EU_TLD.test(href)) {
    score = 40;
  } else if (PREMIUM_EU_INTL.some((s) => src.includes(s))) {
    score = 30;
  } else {
    score = 10;
  }

  if (hasImage) score += 20;
  return score;
}

export function isProductSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

type ShoppingApiResult = {
  title?: string;
  source?: string;
  link?: string;
  thumbnail?: string;
  extracted_price?: number;
  currency?: string;
  price?: string; // fallback string e.g. "59,95 €"
};

type ProductAnalysis = {
  productType: string;
  searchQueries: string[];
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

// ---------------------------------------------------------------------------
// SerpAPI Google Shopping — text-based product search
// ---------------------------------------------------------------------------

async function textSearch(query: string, apiKey: string): Promise<PricedMatch[]> {
  try {
    const url = new URL(SERPAPI_ENDPOINT);
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", query);
    url.searchParams.set("gl", "de");
    url.searchParams.set("hl", "de");
    // NOTE: omit "location" — it can conflict with gl=de for shopping results
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`[textSearch] HTTP ${response.status} für: ${query}`);
      return [];
    }

    const data = (await response.json()) as {
      shopping_results?: ShoppingApiResult[];
    };
    const raw = data.shopping_results ?? [];

    console.log(`[textSearch] "${query}" → ${raw.length} raw results`);
    raw.slice(0, 6).forEach((r, i) => {
      console.log(
        `  [${i}] "${(r.title ?? "").slice(0, 45)}" | src="${r.source}" | cur="${r.currency}" | price="${r.price}" | extracted=${r.extracted_price} | link=${(r.link ?? "").slice(0, 60)}`,
      );
    });

    return raw
      .map((r): PricedMatch | null => {
        let extractedPrice = r.extracted_price;

        // Fallback: parse from price string (e.g. "59,95 €" or "€59.95")
        if (typeof extractedPrice !== "number" && r.price) {
          const digits = r.price.replace(/[^\d,\.]/g, "").replace(",", ".");
          const parsed = parseFloat(digits);
          if (!isNaN(parsed) && parsed > 0) extractedPrice = parsed;
        }

        if (!r.title || typeof extractedPrice !== "number") return null;

        // Normalize currency to "€" / "$" / "£"
        const currency = normalizeCurrency(r.currency) || (
          r.price?.includes("€") ? "€" :
          r.price?.includes("$") ? "$" :
          r.price?.includes("£") ? "£" :
          undefined
        );

        return {
          title: r.title,
          source: r.source,
          link: r.link,
          thumbnail: r.thumbnail,
          price: { extracted_value: extractedPrice, currency },
        };
      })
      .filter((m): m is PricedMatch => m !== null);
  } catch (err) {
    console.error("[textSearch] Fehler:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// GPT Vision — generate EU-optimized search queries for hard products
// ---------------------------------------------------------------------------

async function generateSearchQueries(imageUrl: string): Promise<ProductAnalysis | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              {
                type: "text",
                text: [
                  "Analyze this product image for a German price-comparison app.",
                  'Return JSON: {"productType":"black hooded puffer jacket men","searchQueries":["CP Company black goggle puffer jacket","schwarze Daunenjacke Kapuze Herren","Stone Island black nylon down jacket","Moncler black hooded down jacket","black quilted puffer jacket premium men"]}',
                  "",
                  "Rules:",
                  "- productType: concise (color + material + product type + gender if visible)",
                  "- searchQueries: exactly 5 queries to find this or similar products on EU shops (Zalando, adidas.de, nike.de, Farfetch, Mytheresa…)",
                  "- Mix: 2 specific brand guesses, 2 generic descriptive queries, 1 German query (Deutsch)",
                  "- Optimize for findability on German/EU e-commerce sites",
                  "- If no product recognizable: {\"productType\":\"\",\"searchQueries\":[]}",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[generateSearchQueries] OpenAI HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as ProductAnalysis;
    if (!parsed.productType || !Array.isArray(parsed.searchQueries) || parsed.searchQueries.length === 0) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[generateSearchQueries] Fehler:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deduplication by product link
// ---------------------------------------------------------------------------

function deduplicate(matches: PricedMatch[]): PricedMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (!m.link) return true;
    if (seen.has(m.link)) return false;
    seen.add(m.link);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main export: 3-stage pipeline with full diagnostic logging
// ---------------------------------------------------------------------------

export async function searchWithGoogleLens(
  image: UploadedImage,
): Promise<AnalysisResult | null | "no_eu_shop"> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  let blobUrl: string | null = null;

  try {
    const extension =
      image.mimeType === "image/png" ? "png"
      : image.mimeType === "image/webp" ? "webp"
      : "jpg";

    const blob = await put(
      `spotted-scans/${Date.now()}.${extension}`,
      image.buffer,
      { access: "private", contentType: image.mimeType },
    );
    blobUrl = blob.url;

    const validUntil = Date.now() + 10 * 60 * 1000;
    const signedToken = await issueSignedToken({
      pathname: blob.pathname, operations: ["get"], validUntil,
    });
    const { presignedUrl: imageUrl } = await presignUrl(signedToken, {
      operation: "get", pathname: blob.pathname, access: "private", validUntil,
    });

    // -----------------------------------------------------------------------
    // Stage 1: Google Lens
    // -----------------------------------------------------------------------
    const lensUrl = new URL(SERPAPI_ENDPOINT);
    lensUrl.searchParams.set("engine", "google_lens");
    lensUrl.searchParams.set("url", imageUrl);
    lensUrl.searchParams.set("api_key", apiKey);
    lensUrl.searchParams.set("hl", "de");
    lensUrl.searchParams.set("gl", "de");

    let lensMatches: LensVisualMatch[] = [];
    const lensResp = await fetch(lensUrl.toString());
    if (lensResp.ok) {
      const lensData = (await lensResp.json()) as { visual_matches?: LensVisualMatch[] };
      lensMatches = lensData.visual_matches ?? [];
    } else {
      console.error(`[Stage 1] Lens HTTP ${lensResp.status}`);
    }

    const lensPriced = lensMatches.filter(
      (m): m is PricedMatch =>
        typeof m.price?.extracted_value === "number" && Boolean(m.title),
    );
    const lensEU = lensPriced.filter(isEUEligible);

    // Diagnostic: log every priced Lens result
    console.log(
      `[Stage 1] Lens: ${lensMatches.length} total, ${lensPriced.length} priced, ${lensEU.length} EU-eligible`,
    );
    lensPriced.forEach((m, i) => {
      const reason = euRejectReason(m);
      console.log(
        `  [${i}] "${m.title.slice(0, 45)}" | src="${m.source}" | cur="${m.price.currency}" | val=${m.price.extracted_value} | ${reason} | link=${(m.link ?? "").slice(0, 70)}`,
      );
    });

    if (lensEU.length >= MIN_EU_MATCHES) {
      const sorted = [...lensEU].sort((a, b) => shopScore(b) - shopScore(a));
      const result = await finalizeResult(imageUrl, sorted);
      if (result) return result;
    }

    // -----------------------------------------------------------------------
    // Stage 2: Shopping on Lens titles (fast non-AI fallback)
    // -----------------------------------------------------------------------
    let hadAnyPricedResults = lensPriced.length > 0;

    if (lensPriced.length > 0) {
      const lensQueries = [...lensPriced]
        .sort((a, b) => shopScore(b) - shopScore(a))
        .slice(0, 3)
        .map((m) => m.title.trim())
        .filter(Boolean);

      console.log(`[Stage 2] Shopping queries:`, lensQueries);

      const stage2Results = await Promise.all(
        lensQueries.map((q) => textSearch(q, apiKey)),
      );
      const stage2All = stage2Results.flat();
      const stage2EU = stage2All.filter(isEUEligible);

      console.log(
        `[Stage 2] ${stage2All.length} Shopping results, ${stage2EU.length} EU-eligible`,
      );
      stage2All.forEach((m, i) => {
        const reason = euRejectReason(m);
        if (reason !== "passes" && reason !== "passes(eu_tld)" && reason !== "passes(known_eu)") {
          console.log(
            `  [${i}] REJECTED: "${m.title.slice(0, 40)}" | src="${m.source}" | cur="${m.price.currency}" | reason=${reason}`,
          );
        }
      });

      const merged2 = deduplicate([...lensEU, ...stage2EU]);
      const sorted2 = merged2.sort((a, b) => shopScore(b) - shopScore(a));

      console.log(`[Stage 2] Merged EU: ${sorted2.length}`);

      if (sorted2.length >= MIN_EU_MATCHES) {
        const result = await finalizeResult(imageUrl, sorted2);
        if (result) return result;
      }
    }

    // -----------------------------------------------------------------------
    // Stage 3: GPT Vision → better queries → Shopping
    // -----------------------------------------------------------------------
    if (!getOpenAIKey()) {
      console.log(`[Stage 3] Kein OpenAI-Key → kein GPT-Fallback.`);
      return hadAnyPricedResults ? "no_eu_shop" : null;
    }

    const productAnalysis = await generateSearchQueries(imageUrl);

    if (!productAnalysis) {
      console.log(`[Stage 3] GPT konnte kein Produkt erkennen.`);
      return hadAnyPricedResults ? "no_eu_shop" : null;
    }

    console.log(
      `[Stage 3] GPT: "${productAnalysis.productType}" | Queries:`,
      productAnalysis.searchQueries,
    );

    const stage3Results = await Promise.all(
      productAnalysis.searchQueries.slice(0, 3).map((q) => textSearch(q, apiKey)),
    );
    const stage3All = stage3Results.flat();
    const stage3EU = stage3All.filter(isEUEligible);
    hadAnyPricedResults = hadAnyPricedResults || stage3All.length > 0;

    console.log(
      `[Stage 3] ${stage3All.length} Shopping results, ${stage3EU.length} EU-eligible`,
    );

    const merged3 = deduplicate([...lensEU, ...stage3EU]);
    const sorted3 = merged3.sort((a, b) => shopScore(b) - shopScore(a));

    console.log(`[Stage 3] Merged EU: ${sorted3.length}`);

    if (sorted3.length < MIN_EU_MATCHES) {
      console.log(
        `[searchWithGoogleLens] Alle 3 Stages erschöpft: nur ${sorted3.length} EU-Treffer. → ${hadAnyPricedResults ? "no_eu_shop" : "null"}`,
      );
      return hadAnyPricedResults ? "no_eu_shop" : null;
    }

    const result = await finalizeResult(imageUrl, sorted3);
    return result ?? (hadAnyPricedResults ? "no_eu_shop" : null);
  } finally {
    if (blobUrl) {
      await del(blobUrl).catch((err) =>
        console.error("Konnte temporären Blob nicht löschen:", err),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Finalize: GPT refinement (9s timeout) → heuristic fallback
// ---------------------------------------------------------------------------

async function finalizeResult(
  imageUrl: string,
  sorted: PricedMatch[],
): Promise<AnalysisResult | null> {
  if (sorted.length < MIN_EU_MATCHES) return null;

  if (!getOpenAIKey()) return buildResultFromPriced(sorted);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const gptTimeoutPromise = new Promise<null>(
    (resolve) => { timeoutId = setTimeout(() => resolve(null), GPT_TIMEOUT_MS); },
  );

  const gptResult = await Promise.race([
    refineWithOpenAI(imageUrl, sorted.slice(0, MAX_GPT_MATCHES)),
    gptTimeoutPromise,
  ]);
  if (timeoutId !== null) clearTimeout(timeoutId);

  if (gptResult === null) {
    console.warn(`[finalizeResult] GPT-Timeout → Heuristik.`);
    return buildResultFromPriced(sorted);
  }

  return gptResult;
}

// ---------------------------------------------------------------------------
// GPT refinement: picks original / best / cheapest / premium
// ---------------------------------------------------------------------------

async function refineWithOpenAI(
  imageUrl: string,
  priced: PricedMatch[],
): Promise<AnalysisResult | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  const matchList = priced.map((m, i) => ({
    index: i,
    title: m.title,
    store: m.source ?? "Unknown",
    price: m.price.extracted_value,
    currency: normalizeCurrency(m.price.currency) || "€",
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
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              {
                type: "text",
                text: [
                  "Select entries from EU shop candidates for a German price-comparison app.",
                  `Candidates (pre-sorted by EU quality, all ship to Germany): ${JSON.stringify(matchList)}`,
                  "",
                  'Return JSON: {"originalIndex":0,"bestIndex":1,"cheapestIndex":2,"premiumIndex":3,"productName":"Nike Air Max 97","brand":"Nike","category":"Schuhe","confidence":82}',
                  "",
                  "Rules:",
                  "- originalIndex: closest visual match to the photo",
                  "- bestIndex: best value from a German/brand shop (prefer Zalando, About You, Breuninger, adidas.de)",
                  "- cheapestIndex: lowest price (must differ from original and best)",
                  "- premiumIndex: premium option — Farfetch, Mytheresa, SSENSE, Mr Porter preferred (must differ from all others)",
                  "- All four indices MUST be different",
                  "- productName: clean brand + product name only",
                  "- category: one of Schuhe, Hoodie, Shirt, Jacke, Hose, Uhr, Tasche, Gürtel, Brille, Kleid, Produkt",
                  "- confidence: 50–95",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[refineWithOpenAI] OpenAI HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const gpt = JSON.parse(content) as GPTRefinement;
    const indices = [gpt.originalIndex, gpt.bestIndex, gpt.cheapestIndex, gpt.premiumIndex];

    if (indices.some((i) => typeof i !== "number" || i < 0 || i >= priced.length)) {
      console.error("[refineWithOpenAI] Ungültige Indices:", gpt);
      return null;
    }
    if (new Set(indices).size < 4) {
      console.warn("[refineWithOpenAI] Doppelte Indices → Heuristik.");
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
    const bestImg = (m: PricedMatch) => m.image ?? m.thumbnail ?? anyThumb;
    const brand = gpt.brand?.trim() || guessBrand(original.title);
    const category = gpt.category?.trim() || guessCategory(original.title);

    const toAlt = (match: PricedMatch, role: AlternativeProduct["role"]): AlternativeProduct => ({
      role,
      name: match.title.trim(),
      store: match.source ?? "Unbekannter Shop",
      price: match.price.extracted_value,
      savingsPercent: Math.max(
        0,
        Math.round((1 - match.price.extracted_value / original.price.extracted_value) * 100),
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
        best: toAlt(best, "best"),
        cheapest: toAlt(cheapest, "cheapest"),
        premium: toAlt(premium, "premium"),
      },
    };
  } catch (err) {
    console.error("[refineWithOpenAI] Fehler:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heuristic builder — sorts by price, no AI
// ---------------------------------------------------------------------------

function buildResultFromPriced(priced: PricedMatch[]): AnalysisResult | null {
  if (priced.length < MIN_EU_MATCHES) return null;

  const [original, ...rest] = priced;
  const byPrice = [...rest].sort((a, b) => a.price.extracted_value - b.price.extracted_value);
  const cheapest = byPrice[0];
  const premium = byPrice[byPrice.length - 1];
  const best = byPrice[Math.floor(byPrice.length / 2)];
  const prices = priced.map((m) => m.price.extracted_value);
  const anyThumb =
    priced.find((m) => m.image ?? m.thumbnail)?.image ??
    priced.find((m) => m.thumbnail)?.thumbnail;
  const bestImg = (m: PricedMatch) => m.image ?? m.thumbnail ?? anyThumb;

  const toAlt = (match: PricedMatch, role: AlternativeProduct["role"]): AlternativeProduct => ({
    role,
    name: cleanTitle(match.title),
    store: match.source ?? "Unbekannter Shop",
    price: match.price.extracted_value,
    savingsPercent: Math.max(
      0,
      Math.round((1 - match.price.extracted_value / original.price.extracted_value) * 100),
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
      best: toAlt(best, "best"),
      cheapest: toAlt(cheapest, "cheapest"),
      premium: toAlt(premium, "premium"),
    },
  };
}

/** Wrapper für Aufrufe mit dem alten LensVisualMatch[]-Interface. */
function buildResultFromMatches(matches: LensVisualMatch[]): AnalysisResult | null {
  const priced = matches.filter(
    (m): m is PricedMatch =>
      typeof m.price?.extracted_value === "number" && Boolean(m.title),
  );
  return buildResultFromPriced(priced);
}

export { buildResultFromMatches };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cleanTitle(t: string): string { return t.trim(); }

const KNOWN_BRANDS = [
  "Adidas Originals", "Adidas", "Nike", "Puma", "Reebok",
  "New Balance", "Converse", "Vans", "Levi's", "Levis",
  "Tommy Hilfiger", "Calvin Klein", "Ralph Lauren", "Lacoste",
  "Hugo Boss", "Boss", "Zara", "H&M", "Uniqlo", "Mango",
  "COS", "Arket", "Gucci", "Prada", "Louis Vuitton", "Chanel",
  "Dior", "Balenciaga", "Versace", "Burberry", "The North Face",
  "Patagonia", "Carhartt", "Champion", "Fila", "Under Armour",
  "Daniel Wellington", "Fossil", "Casio", "Swatch", "Garmin",
  "Apple", "Marc O'Polo", "Filippa K", "Acne Studios",
  "Stüssy", "Supreme", "CP Company", "Stone Island", "Moncler",
  "Parajumpers", "Arc'teryx", "Canada Goose",
] as const;

function guessBrand(title: string): string {
  const lower = title.toLowerCase();
  const match = KNOWN_BRANDS.find((b) => lower.includes(b.toLowerCase()));
  if (match) return match;
  return title.trim().split(/\s+/)[0] || "Unbekannt";
}

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (/sneaker|schuh|shoe|stiefel|boot|sandale/.test(t)) return "Schuhe";
  if (/hoodie|pullover|sweatshirt/.test(t)) return "Hoodie";
  if (/t-shirt|shirt|top/.test(t)) return "Shirt";
  if (/jacke|jacket|mantel|coat|parka|puffer|daunenjacke/.test(t)) return "Jacke";
  if (/hose|jeans|pants|trousers|chino/.test(t)) return "Hose";
  if (/uhr|watch/.test(t)) return "Uhr";
  if (/tasche|bag|rucksack|backpack/.test(t)) return "Tasche";
  if (/gürtel|guertel|belt/.test(t)) return "Gürtel";
  if (/brille|sunglasses|glasses/.test(t)) return "Brille";
  if (/kleid|dress/.test(t)) return "Kleid";
  return "Produkt";
}
