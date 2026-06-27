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

// Shops to target with dedicated site: queries in parallel with the general Shopping search.
// These are the most relevant EU shops for fashion products.
const PRIORITY_SHOP_SITES = [
  "zalando.de",
  "aboutyou.de",
  "breuninger.com",
  "peek-cloppenburg.de",
  "ralphlauren.de",
  "farfetch.com",
] as const;

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

// Exported so the debug endpoint and tests can reuse the type.
export type ProductAnalysis = {
  // Core identification
  productType: string;         // "Polo T-Shirt" | "Daunenjacke" | "Laufschuhe" | ...
  category: string;            // Shirt | Jacke | Schuhe | Hose | Hoodie | Uhr | Tasche | ...
  brand: string;               // primary brand if visible, "" if not
  brandCandidates: string[];   // all plausible brands from any logo/label/text
  // Colors
  primaryColor: string;        // precise German: "navy blau" | "schwarz" | "dunkelgrün" | ...
  secondaryColors: string[];   // ["rot","weiß"]
  // Construction
  material: string;            // "Baumwolle" | "Leder" | "Nylon" | ""
  pattern: string;             // "einfarbig" | "gestreift" | "kariert" | ""
  fit: string;                 // "Regular Fit" | "Slim Fit" | "Oversized" | ""
  sleeveLength: string;        // "kurz" | "lang" | "ärmellos" | "3/4" | ""
  neckline: string;            // "Rundhals" | "V-Ausschnitt" | "Polo-Kragen" | "Rollkragen" | ""
  hood: boolean;               // true if hoodie / has a hood
  zipper: boolean;             // true if a zipper is visible
  pockets: string;             // "2 Seitentaschen" | "Brusttasche" | ""
  // Branding
  logoPosition: string;        // "linke Brust" | "Rücken" | "Ärmel" | "" (empty = no logo)
  logoColor: string;           // "rot" | "weiß" | ""
  // Free-text
  distinctiveFeatures: string; // e.g. "Gooseneck-Tasche, reflektierender Streifen"
  // Context
  gender: string;              // "Herren" | "Damen" | "Unisex" | ""
};

// A single search query with a human-readable strategy tag for logging.
export type SearchQuery = { query: string; strategy: string };

// Full debug report returned by /api/debug/vision and logged by the pipeline.
export type VisionDebugReport = {
  imageUrl: string;
  timestamp: string;
  analysis: ProductAnalysis | null;
  queries: SearchQuery[];
  error?: string;
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
// GPT Vision — returns structured visual analysis only (no queries)
// Queries are built algorithmically by buildSearchQueries() below.
// ---------------------------------------------------------------------------

const ANALYSIS_EXAMPLE: ProductAnalysis = {
  productType: "Polo T-Shirt",
  category: "Shirt",
  brand: "Ralph Lauren",
  brandCandidates: ["Ralph Lauren", "Polo"],
  primaryColor: "navy blau",
  secondaryColors: ["rot", "weiß"],
  material: "Baumwolle",
  pattern: "einfarbig",
  fit: "Regular Fit",
  sleeveLength: "kurz",
  neckline: "Polo-Kragen",
  hood: false,
  zipper: false,
  pockets: "",
  logoPosition: "linke Brust",
  logoColor: "rot",
  distinctiveFeatures: "kleines Polo-Reiter-Emblem, gerippter Kragen und Bündchen",
  gender: "Herren",
};

export async function analyzeImageWithGPT(imageUrl: string): Promise<ProductAnalysis | null> {
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
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text: [
                  `Analyze this fashion product image. Return JSON with exactly these fields: ${Object.keys(ANALYSIS_EXAMPLE).join(", ")}`,
                  "",
                  `Example: ${JSON.stringify(ANALYSIS_EXAMPLE)}`,
                  "",
                  "Rules per field:",
                  "- productType: specific German name ('Crewneck T-Shirt' not 'T-Shirt'; 'Daunenjacke' not 'Jacke'; 'Laufschuhe' not 'Schuhe')",
                  "- category: one of Shirt | Jacke | Schuhe | Hose | Hoodie | Uhr | Tasche | Gürtel | Brille | Kleid | Cap | Produkt",
                  "- brand: exact brand name if visible ('Ralph Lauren', 'CP Company', 'Nike'), '' if not visible",
                  "- brandCandidates: all plausible brands from any logo/label/text; [] if none visible",
                  "- primaryColor: PRECISE German color — never just 'blau', say 'navy blau' | 'hellblau' | 'royalblau' | 'dunkelblau' | 'cobalt blau' etc.",
                  "- sleeveLength: 'kurz' | 'lang' | 'ärmellos' | '3/4' | '' (only for tops/shirts)",
                  "- neckline: 'Rundhals' | 'V-Ausschnitt' | 'Polo-Kragen' | 'Rollkragen' | 'Kapuze' | '' (only for tops)",
                  "- hood: true if garment has a visible hood, false otherwise",
                  "- zipper: true if a zipper is visible on the garment, false otherwise",
                  "- pockets: describe visible pockets ('2 Seitentaschen', 'Brusttasche', '') or ''",
                  "- logoPosition: where the brand logo appears ('linke Brust', 'Rücken', 'Ärmel', 'Schuh-Seite'), '' if no logo",
                  "- distinctiveFeatures: comma-separated list of unique visual details that distinguish this exact product",
                  "- gender: 'Herren' | 'Damen' | 'Unisex' | ''",
                  "- If no fashion product is visible: set productType='' and all string fields='' and arrays=[]",
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[analyzeImageWithGPT] OpenAI HTTP ${response.status}`);
      return null;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as ProductAnalysis;
    if (!parsed.productType || !parsed.primaryColor) {
      console.warn("[analyzeImageWithGPT] Incomplete response:", parsed);
      return null;
    }

    console.log("[analyzeImageWithGPT] Vision output:");
    console.log(`  productType="${parsed.productType}" category="${parsed.category}"`);
    console.log(`  brand="${parsed.brand}" brandCandidates=[${parsed.brandCandidates?.join(", ")}]`);
    console.log(`  primaryColor="${parsed.primaryColor}" secondaryColors=[${parsed.secondaryColors?.join(", ")}]`);
    console.log(`  material="${parsed.material}" pattern="${parsed.pattern}" fit="${parsed.fit}"`);
    console.log(`  sleeveLength="${parsed.sleeveLength}" neckline="${parsed.neckline}" hood=${parsed.hood} zipper=${parsed.zipper}`);
    console.log(`  pockets="${parsed.pockets}" logoPosition="${parsed.logoPosition}" logoColor="${parsed.logoColor}"`);
    console.log(`  gender="${parsed.gender}" distinctiveFeatures="${parsed.distinctiveFeatures}"`);

    return parsed;
  } catch (err) {
    console.error("[analyzeImageWithGPT] Fehler:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query builder — generates 5–10 diverse Shopping queries from structured analysis.
// Each query targets a different search angle so they return different result sets.
// No brand names or product names hardcoded here — everything comes from `a`.
// ---------------------------------------------------------------------------

export function buildSearchQueries(a: ProductAnalysis): SearchQuery[] {
  const seen = new Set<string>();
  const list: SearchQuery[] = [];

  const add = (raw: string, strategy: string) => {
    const q = raw.trim().replace(/\s+/g, " ");
    if (q.length > 5 && !seen.has(q.toLowerCase())) {
      seen.add(q.toLowerCase());
      list.push({ query: q, strategy });
    }
  };

  // Join only non-empty string parts
  const j = (...parts: unknown[]): string =>
    (parts as (string | boolean | undefined | null)[])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .join(" ");

  const brand = a.brand || a.brandCandidates?.[0] || "";
  const hoodStr = a.hood ? "mit Kapuze" : "";
  const zipperStr = a.zipper ? "mit Reißverschluss" : "";

  // ── Brand queries (precision) ────────────────────────────────────────────────
  if (brand) {
    // most specific
    add(j(brand, a.primaryColor, a.productType, a.material || a.fit), "brand+color+type+material");
    // standard
    add(j(brand, a.primaryColor, a.productType), "brand+color+type");
    // garment details (fit/sleeve/neckline)
    if (a.fit || a.sleeveLength || a.neckline) {
      add(j(brand, a.productType, a.fit, a.sleeveLength, a.neckline, a.primaryColor), "brand+type+details");
    }
    // logo-based (when logo position is known)
    if (a.logoPosition) {
      add(j(brand, a.productType, a.logoColor, "Logo", a.logoPosition), "brand+logo");
    }
    // construction features (hood/zipper)
    if (hoodStr || zipperStr) {
      add(j(brand, a.primaryColor, a.productType, hoodStr || zipperStr), "brand+construction");
    }
    // alternative brand candidate
    if (a.brandCandidates.length > 1) {
      add(j(a.brandCandidates[1], a.primaryColor, a.productType), `altbrand:${a.brandCandidates[1]}`);
    }
  }

  // ── No-brand queries (recall) ────────────────────────────────────────────────
  add(j(a.primaryColor, a.productType, a.fit, a.gender), "color+type+fit+gender");
  add(j(a.primaryColor, a.productType, a.gender), "color+type+gender");

  if (a.pattern && a.pattern.toLowerCase() !== "einfarbig") {
    add(j(a.primaryColor, a.pattern, a.productType, a.gender), "color+pattern+type");
  }
  if (a.material) {
    add(j(a.material, a.primaryColor, a.productType, a.gender), "material+color+type");
  }
  if (a.sleeveLength || a.neckline) {
    add(j(a.primaryColor, a.sleeveLength, a.neckline, a.productType), "color+details+type");
  }
  if (a.distinctiveFeatures) {
    const firstFeature = a.distinctiveFeatures.split(/[,;]/)[0]?.trim();
    if (firstFeature) add(j(a.primaryColor, a.productType, firstFeature), "color+type+feature");
  }

  // Minimum fallback
  if (list.length === 0) {
    add(j(a.primaryColor, a.productType), "fallback:color+type");
    if (a.productType) add(a.productType, "fallback:type-only");
  }

  return list.slice(0, 10);
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
      analyzeImageWithGPT(imageUrl),
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
    lensPriced.forEach((m, i) => {
      const reason = euRejectReason(m);
      console.log(
        `  L[${i}] "${m.title.slice(0, 45)}" | src="${m.source}" | cur="${m.price.currency}" | ${reason}`,
      );
    });

    // Build all search queries from the structured vision analysis.
    const allQueries: SearchQuery[] = productAnalysis ? buildSearchQueries(productAnalysis) : [];
    const brandQueries = allQueries.filter(
      (q) => q.strategy.startsWith("brand") || q.strategy.startsWith("altbrand"),
    );
    const nobrandQueries = allQueries.filter(
      (q) => !q.strategy.startsWith("brand") && !q.strategy.startsWith("altbrand"),
    );

    // Full query log — the main observability instrument.
    console.log(`[Stage 0] Vision → ${allQueries.length} queries (${brandQueries.length} brand, ${nobrandQueries.length} no-brand):`);
    allQueries.forEach((q, i) =>
      console.log(`  Q[${i}] [${q.strategy}] "${q.query}"`),
    );

    let allEU: PricedMatch[] = [...lensEU];
    let hadAnyPricedResults = lensPriced.length > 0;

    // -----------------------------------------------------------------------
    // Stage 1: brand queries + site-specific variants (all parallel).
    // -----------------------------------------------------------------------
    if (brandQueries.length > 0) {
      const baseQuery = brandQueries[0].query;
      const stage1Queries: string[] = [
        ...brandQueries.map((q) => q.query),
        ...PRIORITY_SHOP_SITES.map((site) => `${baseQuery} site:${site}`),
      ];

      console.log(`[Stage 1] Firing ${stage1Queries.length} parallel Shopping searches`);
      stage1Queries.forEach((q, i) => console.log(`  S1[${i}] "${q}"`));

      const stage1Raw = await Promise.all(stage1Queries.map((q) => textSearch(q, apiKey)));
      const stage1All = stage1Raw.flat();
      const stage1EU = stage1All.filter(isEUEligible);
      hadAnyPricedResults = hadAnyPricedResults || stage1All.length > 0;

      console.log(`[Stage 1] ${stage1All.length} total, ${stage1EU.length} EU-eligible`);
      stage1All.forEach((m, i) => {
        const r = euRejectReason(m);
        if (r !== "passes" && r !== "passes(eu_tld)" && r !== "passes(known_eu)") {
          console.log(
            `  S1[${i}] REJECTED: "${m.title.slice(0, 40)}" | src="${m.source}" | cur="${m.price.currency}" | ${r}`,
          );
        }
      });

      allEU = deduplicate([...allEU, ...stage1EU]);
      console.log(`[Stage 1] Pool: ${allEU.length} EU results`);

      if (allEU.length >= MIN_EU_MATCHES) {
        const sorted = allEU.sort((a, b) => shopScore(b) - shopScore(a));
        const result = await finalizeResult(imageUrl, sorted, productAnalysis);
        if (result) return result;
      }
    }

    // -----------------------------------------------------------------------
    // Stage 2: no-brand queries (higher recall) OR top Lens titles as last resort.
    // -----------------------------------------------------------------------
    const stage2QueryStrings: string[] = nobrandQueries.length > 0
      ? nobrandQueries.map((q) => q.query)
      : [...lensPriced]
          .sort((a, b) => shopScore(b) - shopScore(a))
          .slice(0, 3)
          .map((m) => m.title.trim())
          .filter(Boolean);

    if (stage2QueryStrings.length > 0) {
      console.log(`[Stage 2] Fallback queries (${stage2QueryStrings.length}):`);
      stage2QueryStrings.forEach((q, i) => console.log(`  S2[${i}] "${q}"`));
      const fallbackResults = await Promise.all(
        stage2QueryStrings.slice(0, 5).map((q) => textSearch(q, apiKey)),
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

function countLinks(result: AnalysisResult): number {
  return [
    result.originalProduct.link,
    result.alternatives.best.link,
    result.alternatives.cheapest.link,
    result.alternatives.premium.link,
  ].filter(Boolean).length;
}

async function finalizeResult(
  imageUrl: string,
  sorted: PricedMatch[],
  productAnalysis: ProductAnalysis | null,
): Promise<AnalysisResult | null> {
  if (sorted.length < MIN_EU_MATCHES) return null;

  const candidate = getOpenAIKey()
    ? await (async () => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const gptTimeoutPromise = new Promise<null>(
          (resolve) => { timeoutId = setTimeout(() => resolve(null), GPT_TIMEOUT_MS); },
        );
        const gptResult = await Promise.race([
          refineWithOpenAI(imageUrl, sorted.slice(0, MAX_GPT_MATCHES), productAnalysis),
          gptTimeoutPromise,
        ]);
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (gptResult === null) console.warn("[finalizeResult] GPT-Timeout → Heuristik.");
        return gptResult ?? buildResultFromPriced(sorted);
      })()
    : buildResultFromPriced(sorted);

  if (!candidate) return null;

  // Require at least 2 items to have real product links.
  // Shopping results always have links; this guards against Lens-only pools.
  const linked = countLinks(candidate);
  if (linked < 2) {
    console.warn(`[finalizeResult] Only ${linked}/4 items have product links — skipping this pool`);
    return null;
  }

  return candidate;
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
        `PRODUCT IN PHOTO: ${productAnalysis.primaryColor} ${productAnalysis.productType}.`,
        (productAnalysis.brand || productAnalysis.brandCandidates?.length)
          ? `Brand: ${productAnalysis.brand || productAnalysis.brandCandidates.join(" / ")}.`
          : "Brand: not visible.",
        productAnalysis.logoPosition
          ? `Logo: ${productAnalysis.logoColor || ""} logo at ${productAnalysis.logoPosition}.`
          : "",
        productAnalysis.fit ? `Fit: ${productAnalysis.fit}.` : "",
        productAnalysis.sleeveLength ? `Sleeve: ${productAnalysis.sleeveLength}.` : "",
        productAnalysis.neckline ? `Neckline: ${productAnalysis.neckline}.` : "",
        productAnalysis.distinctiveFeatures
          ? `Distinctive: ${productAnalysis.distinctiveFeatures}.`
          : "",
        `Gender: ${productAnalysis.gender || "not specified"}.`,
        `HARD CONSTRAINTS — originalIndex MUST satisfy:`,
        `  1. Color = "${productAnalysis.primaryColor}" (wrong color → score ≤55 → rejected)`,
        `  2. Type = "${productAnalysis.productType}" (wrong type → score ≤55 → rejected)`,
        (productAnalysis.brand || productAnalysis.brandCandidates?.length)
          ? `  3. Brand = ${productAnalysis.brand || productAnalysis.brandCandidates.join(" or ")} (wrong brand → −35 pts)`
          : `  3. Brand: not required (not visible in photo)`,
      ].filter(Boolean).join(" ")
    : "Match by COLOR first (wrong color = wrong product), then product type, then brand.";

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
                  "  +35 pts: color matches exactly (navy ≠ white/beige/grey/black; black ≠ navy/grey/brown)",
                  "  +20 pts: product type matches exactly (T-Shirt ≠ Polo ≠ Hoodie ≠ Sweatshirt; Sneaker ≠ Boot ≠ Sandal)",
                  "  +10 pts: logo / distinctive detail matches",
                  "  HARD RULE: wrong color (even slightly off) → cap score at 55",
                  "  HARD RULE: wrong product type → cap score at 55",
                  "  Wrong color OR wrong product type = score ≤55 = rejected. This is non-negotiable.",
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
    const brand = gpt.brand?.trim() || productAnalysis?.brand || productAnalysis?.brandCandidates?.[0] || guessBrand(original.title);
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
