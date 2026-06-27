import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult, MatchQuality } from "../analysis-types";
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
// Lens uses symbols ("€","$","£"), Shopping uses ISO codes ("EUR","USD","GBP").
// Also handles missing currency (common in Lens visual_matches).
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
// EU eligibility
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

  // Hard-exclude known non-EU shops.
  if (EXCLUDED_SHOP_SOURCES.some((s) =>
    src.includes(s) || href.includes(s.replace(/ /g, ""))
  )) return false;

  // Explicit EUR → accept.
  if (currency === "€") return true;

  // No currency field — accept only from clearly EU sources.
  if (EU_TLD.test(href)) return true;
  if (KNOWN_EU_SHOP_SOURCES.some((s) => src.includes(s))) return true;
  if (OFFICIAL_BRAND_DOMAINS.some((d) =>
    href.includes(d) && (/\.de\b/.test(href) || /\.com\/(de|eu|at|ch)/.test(href))
  )) return true;

  return false;
}

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
  price?: string;
};

type ProductAnalysis = {
  primaryQuery: string;    // e.g. "Polo Ralph Lauren Custom Slim Fit T-Shirt navy red pony"
  brand: string;           // e.g. "Ralph Lauren"
  color: string;           // e.g. "navy blau"
  productType: string;     // e.g. "Polo T-Shirt"
  fallbackQueries: string[]; // 2–3 simpler variations if primaryQuery yields too few results
};

type GPTRefinement = {
  scores: number[];     // one score per candidate (0–100), same order as input
  originalIndex: number;
  bestIndex: number;
  cheapestIndex: number;
  premiumIndex: number;
  productName: string;
  brand: string;
  category: string;
  confidence: number;
  matchQuality: MatchQuality;
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
    url.searchParams.set("location", "Germany");
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`[textSearch] HTTP ${response.status} für: ${query}`);
      return [];
    }

    const data = (await response.json()) as { shopping_results?: ShoppingApiResult[] };
    const raw = data.shopping_results ?? [];

    console.log(`[textSearch] "${query}" → ${raw.length} raw results`);
    raw.slice(0, 5).forEach((r, i) => {
      console.log(
        `  [${i}] "${(r.title ?? "").slice(0, 45)}" | src="${r.source}" | cur="${r.currency}" | price="${r.price}" | ep=${r.extracted_price} | ${(r.link ?? "").slice(0, 70)}`,
      );
    });

    return raw
      .map((r): PricedMatch | null => {
        let extractedPrice = r.extracted_price;
        if (typeof extractedPrice !== "number" && r.price) {
          const digits = r.price.replace(/[^\d,\.]/g, "").replace(",", ".");
          const parsed = parseFloat(digits);
          if (!isNaN(parsed) && parsed > 0) extractedPrice = parsed;
        }
        if (!r.title || typeof extractedPrice !== "number") return null;

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
// GPT Vision — analyze image → structured product analysis + precise query
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
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text: [
                  "Analyze this product image precisely. Return JSON:",
                  '{"primaryQuery":"Polo Ralph Lauren Custom Slim Fit T-Shirt navy blau rotes Pony","brand":"Ralph Lauren","color":"navy blau","productType":"Polo T-Shirt","fallbackQueries":["Polo Ralph Lauren navy T-Shirt Herren","Ralph Lauren Polo Shirt blau"]}',
                  "",
                  "Rules:",
                  "- primaryQuery: ONE precise search query for Google Shopping Germany. Include brand + exact color + product type + distinguishing details (logo type, pattern, cut, material if visible). This is the most important field — make it specific.",
                  "- brand: exact brand name (e.g. 'Ralph Lauren', 'CP Company', 'Adidas', 'Nike'). 'Unbekannt' if not visible.",
                  "- color: exact main color in German (e.g. 'navy blau', 'schwarz', 'weiß', 'rot', 'dunkelgrün')",
                  "- productType: product category in German (e.g. 'Polo T-Shirt', 'Daunenjacke', 'Laufschuhe', 'Jogginghose')",
                  "- fallbackQueries: 2 simpler queries (brand + color + type, no extra details) for when primaryQuery gives no results",
                  "- If no product visible: {\"primaryQuery\":\"\",\"brand\":\"Unbekannt\",\"color\":\"\",\"productType\":\"\",\"fallbackQueries\":[]}",
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
    if (!parsed.primaryQuery || !parsed.color || !parsed.productType) {
      console.warn("[generateSearchQueries] Incomplete GPT response:", parsed);
      return null;
    }
    console.log(
      `[generateSearchQueries] brand="${parsed.brand}" color="${parsed.color}" type="${parsed.productType}" | query: "${parsed.primaryQuery}"`,
    );
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
// Main export: 3-stage pipeline
//
// GPT image analysis runs in PARALLEL with Lens so color-aware queries
// are ready for every Shopping search, not just the last-resort stage.
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
    // Stage 0: run Lens search AND GPT query generation in PARALLEL.
    // Lens = visual breadcrumbs; GPT = precise color-aware Shopping query.
    // -----------------------------------------------------------------------
    const lensUrl = new URL(SERPAPI_ENDPOINT);
    lensUrl.searchParams.set("engine", "google_lens");
    lensUrl.searchParams.set("url", imageUrl);
    lensUrl.searchParams.set("api_key", apiKey);
    lensUrl.searchParams.set("hl", "de");
    lensUrl.searchParams.set("gl", "de");

    const [lensRespRaw, productAnalysis] = await Promise.all([
      fetch(lensUrl.toString()),
      generateSearchQueries(imageUrl),
    ]);

    let lensMatches: LensVisualMatch[] = [];
    if (lensRespRaw.ok) {
      const lensData = (await lensRespRaw.json()) as { visual_matches?: LensVisualMatch[] };
      lensMatches = lensData.visual_matches ?? [];
    } else {
      console.error(`[Stage 0] Lens HTTP ${lensRespRaw.status}`);
    }

    const lensPriced = lensMatches.filter(
      (m): m is PricedMatch =>
        typeof m.price?.extracted_value === "number" && Boolean(m.title),
    );
    const lensEU = lensPriced.filter(isEUEligible);

    console.log(
      `[Stage 0] Lens: ${lensMatches.length} total, ${lensPriced.length} priced, ${lensEU.length} EU-eligible`,
    );
    console.log(
      `[Stage 0] GPT: brand="${productAnalysis?.brand ?? "n/a"}" color="${productAnalysis?.color ?? "n/a"}" | query="${productAnalysis?.primaryQuery ?? "n/a"}"`,
    );
    lensPriced.forEach((m, i) => {
      const reason = euRejectReason(m);
      console.log(
        `  L[${i}] "${m.title.slice(0, 45)}" | src="${m.source}" | cur="${m.price.currency}" | ${reason}`,
      );
    });

    let allEU: PricedMatch[] = [...lensEU];
    let hadAnyPricedResults = lensPriced.length > 0;

    // -----------------------------------------------------------------------
    // Stage 1: PRIMARY — Google Shopping with GPT's precise color-aware query.
    // This is the main source of EU results; Lens is just a supplementary pool.
    // -----------------------------------------------------------------------
    if (productAnalysis?.primaryQuery) {
      console.log(`[Stage 1] Primary Shopping query: "${productAnalysis.primaryQuery}"`);
      const primary = await textSearch(productAnalysis.primaryQuery, apiKey);
      const primaryEU = primary.filter(isEUEligible);
      hadAnyPricedResults = hadAnyPricedResults || primary.length > 0;

      console.log(`[Stage 1] ${primary.length} results, ${primaryEU.length} EU-eligible`);
      primary.forEach((m, i) => {
        const r = euRejectReason(m);
        if (r !== "passes" && r !== "passes(eu_tld)" && r !== "passes(known_eu)") {
          console.log(`  P[${i}] REJECTED: "${m.title.slice(0, 40)}" | src="${m.source}" | cur="${m.price.currency}" | ${r}`);
        }
      });

      allEU = deduplicate([...allEU, ...primaryEU]);
      console.log(`[Stage 1] Pool after primary: ${allEU.length} EU results`);

      if (allEU.length >= MIN_EU_MATCHES) {
        const sorted = allEU.sort((a, b) => shopScore(b) - shopScore(a));
        const result = await finalizeResult(imageUrl, sorted, productAnalysis);
        if (result) return result;
      }
    }

    // -----------------------------------------------------------------------
    // Stage 2: FALLBACK — GPT fallback queries OR top Lens titles (no GPT).
    // -----------------------------------------------------------------------
    const fallbackQueries: string[] =
      productAnalysis?.fallbackQueries?.filter(Boolean) ??
      [...lensPriced]
        .sort((a, b) => shopScore(b) - shopScore(a))
        .slice(0, 3)
        .map((m) => m.title.trim())
        .filter(Boolean);

    if (fallbackQueries.length > 0) {
      console.log(`[Stage 2] Fallback queries:`, fallbackQueries);
      const fallbackResults = await Promise.all(
        fallbackQueries.slice(0, 3).map((q) => textSearch(q, apiKey)),
      );
      const fallbackAll = fallbackResults.flat();
      const fallbackEU = fallbackAll.filter(isEUEligible);
      hadAnyPricedResults = hadAnyPricedResults || fallbackAll.length > 0;

      console.log(`[Stage 2] ${fallbackAll.length} results, ${fallbackEU.length} EU-eligible`);

      allEU = deduplicate([...allEU, ...fallbackEU]);
      console.log(`[Stage 2] Pool after fallback: ${allEU.length} EU results`);

      if (allEU.length >= MIN_EU_MATCHES) {
        const sorted = allEU.sort((a, b) => shopScore(b) - shopScore(a));
        const result = await finalizeResult(imageUrl, sorted, productAnalysis);
        if (result) return result;
      }
    }

    // -----------------------------------------------------------------------
    // Stage 3: LAST RESORT — finalize with whatever EU results we have (≥1).
    // Better to return an uncertain result than nothing.
    // -----------------------------------------------------------------------
    if (allEU.length > 0 && allEU.length < MIN_EU_MATCHES) {
      // Pad with non-EU priced results (marked shipsFromNonEU later) if needed.
      const nonEU = lensPriced.filter((m) => !allEU.includes(m));
      const padded = deduplicate([...allEU, ...nonEU]).slice(0, MIN_EU_MATCHES);
      if (padded.length >= MIN_EU_MATCHES) {
        const sorted = padded.sort((a, b) => shopScore(b) - shopScore(a));
        const result = await finalizeResult(imageUrl, sorted, productAnalysis);
        if (result) return result;
      }
    }

    console.log(
      `[searchWithGoogleLens] All stages done. hadAnyResults=${hadAnyPricedResults} → ${hadAnyPricedResults ? "no_eu_shop" : "null"}`,
    );
    return hadAnyPricedResults ? "no_eu_shop" : null;
  } finally {
    if (blobUrl) {
      await del(blobUrl).catch((err) =>
        console.error("Konnte temporären Blob nicht löschen:", err),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Finalize: GPT refinement with full product context → heuristic fallback
// ---------------------------------------------------------------------------

async function finalizeResult(
  imageUrl: string,
  sorted: PricedMatch[],
  productAnalysis: ProductAnalysis | null,
): Promise<AnalysisResult | null> {
  if (sorted.length < MIN_EU_MATCHES) return null;

  if (!getOpenAIKey()) return buildResultFromPriced(sorted);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const gptTimeoutPromise = new Promise<null>(
    (resolve) => { timeoutId = setTimeout(() => resolve(null), GPT_TIMEOUT_MS); },
  );

  const gptResult = await Promise.race([
    refineWithOpenAI(imageUrl, sorted.slice(0, MAX_GPT_MATCHES), productAnalysis),
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
// GPT refinement: picks roles and assesses matchQuality with COLOR enforcement
// ---------------------------------------------------------------------------

async function refineWithOpenAI(
  imageUrl: string,
  priced: PricedMatch[],
  productAnalysis: ProductAnalysis | null,
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

  const colorContext = productAnalysis
    ? [
        `Photo shows: "${productAnalysis.color} ${productAnalysis.productType}" by ${productAnalysis.brand}.`,
        `COLOR HARD CONSTRAINT: originalIndex MUST be color="${productAnalysis.color}".`,
        `A "${productAnalysis.color}" item must NOT map to a different color. If no exact color match exists, pick the closest and set matchQuality="similar".`,
      ].join(" ")
    : "Match by COLOR first (this is critical — wrong color = wrong product), then product type, then brand.";

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
              {
                type: "text",
                text: [
                  colorContext,
                  "",
                  `EU shop candidates (all ship to Germany): ${JSON.stringify(matchList)}`,
                  "",
                  "STEP 1 — Score each candidate 0–100 using this rubric:",
                  "  +35 pts: brand matches the photo",
                  "  +35 pts: color matches exactly (navy ≠ white, navy ≠ beige, navy ≠ grey)",
                  "  +20 pts: product type matches exactly (T-Shirt ≠ Polo Shirt ≠ Hoodie)",
                  "  +10 pts: logo / distinctive detail matches",
                  "  Max 100. Wrong brand OR wrong color → score ≤65 (below threshold).",
                  "",
                  "STEP 2 — Pick indices (all must be different):",
                  "  originalIndex: highest-scored candidate",
                  "  bestIndex: best EU/German shop (Zalando, About You, Breuninger, brand .de preferred)",
                  "  cheapestIndex: lowest EUR price",
                  "  premiumIndex: premium shop (Farfetch, Mytheresa, Mr Porter, SSENSE preferred)",
                  "",
                  "STEP 3 — Set matchQuality from scores[originalIndex]:",
                  "  ≥90 → 'exact'   |   70–89 → 'similar'   |   <70 → 'uncertain'",
                  "",
                  'Return JSON: {"scores":[85,92,61,78],"originalIndex":1,"bestIndex":0,"cheapestIndex":2,"premiumIndex":3,"productName":"Polo Ralph Lauren Navy T-Shirt","brand":"Ralph Lauren","category":"Shirt","confidence":88,"matchQuality":"exact"}',
                  "",
                  "Other rules:",
                  "- scores array: one integer per candidate, same order as input",
                  "- productName: brand + color + product name only (no store)",
                  "- category: Schuhe | Hoodie | Shirt | Jacke | Hose | Uhr | Tasche | Gürtel | Brille | Kleid | Produkt",
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

    // Score-based match quality — the core of the ranking engine.
    const scores: number[] = Array.isArray(gpt.scores) ? gpt.scores : [];
    const originalScore = typeof scores[gpt.originalIndex] === "number"
      ? scores[gpt.originalIndex]
      : (gpt.matchQuality === "exact" ? 92 : gpt.matchQuality === "similar" ? 75 : 55);

    console.log(
      `[refineWithOpenAI] scores: ${scores.slice(0, 8).map((s, i) => `[${i}]=${s}`).join(" ")}`,
    );
    console.log(
      `[refineWithOpenAI] originalIndex=${gpt.originalIndex} score=${originalScore}`,
    );

    // <60 means even the best candidate doesn't match the photo (wrong brand or wrong color).
    if (originalScore < 60) {
      console.warn(
        `[refineWithOpenAI] Best score=${originalScore} < 60 — candidates don't match photo → null`,
      );
      return null;
    }

    const matchQuality: MatchQuality =
      originalScore >= 90 ? "exact" :
      originalScore >= 70 ? "similar" :
      "uncertain";

    const original = priced[gpt.originalIndex];
    const best = priced[gpt.bestIndex];
    const cheapest = priced[gpt.cheapestIndex];
    const premium = priced[gpt.premiumIndex];
    const prices = priced.map((m) => m.price.extracted_value);
    const anyThumb =
      priced.find((m) => m.image ?? m.thumbnail)?.image ??
      priced.find((m) => m.thumbnail)?.thumbnail;
    const bestImg = (m: PricedMatch) => m.image ?? m.thumbnail ?? anyThumb;
    const brand = gpt.brand?.trim() || productAnalysis?.brand || guessBrand(original.title);
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

    console.log(
      `[refineWithOpenAI] matchQuality="${matchQuality}" score=${originalScore} | "${original.title.slice(0, 40)}" @ ${original.source}`,
    );

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
      matchQuality,
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
// Heuristic builder — no AI, matchQuality defaults to "uncertain"
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

  return {
    originalProduct: {
      name: cleanTitle(original.title),
      brand: guessBrand(original.title),
      store: original.source ?? "Unbekannter Shop",
      price: original.price.extracted_value,
      imageUrl: bestImg(original),
      link: original.link,
    },
    brand: guessBrand(original.title),
    category: guessCategory(original.title),
    confidence: Math.min(95, 50 + priced.length * 5),
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    matchQuality: "uncertain",
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
