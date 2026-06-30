import { del, issueSignedToken, presignUrl, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult, MatchQuality, QueryDebug, QueryRawDebug, QueryResponseKey, PipelineDebug } from "../analysis-types";
import type { UploadedImage } from "../upload";

export type DebugCollector = {
  queries: QueryDebug[];
  finalCandidateCount: number;
  finalProducts: PipelineDebug["finalProducts"];
  productIdentity?: PipelineDebug["productIdentity"];
  push(q: QueryDebug): void;
};

export function createDebugCollector(): DebugCollector {
  const c: DebugCollector = {
    queries: [],
    finalCandidateCount: 0,
    finalProducts: [],
    push(q) { c.queries.push(q); },
  };
  return c;
}

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MIN_EU_MATCHES = 2;      // minimum pool size to attempt finalizeResult
const MIN_FOR_GPT = 2;         // minimum linked candidates to call GPT
const MAX_GPT_MATCHES = 20;    // pass top 20 candidates to GPT so it can pick up to 8
const MAX_ALTERNATIVES = 7;    // maximum alternatives to show (1 original + 7 = 8 cards)
const GPT_TIMEOUT_MS = 9000;
const MAX_SHOPPING_QUERIES = 3; // hard cap on Shopping API calls per scan
const EARLY_EXIT_LINKED = 20;  // skip remaining queries if we already have enough

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
// Ships-to-Germany filter
//
// We trust Google Shopping's gl=de&location=Germany geotargeting to return
// results relevant for German shoppers. All we do here is block the small
// set of US-only retailers and resale platforms that sometimes slip through.
// ---------------------------------------------------------------------------

const EU_TLD = /\.(de|at|ch|nl|fr|it|es|be|dk|se|fi|pl|pt|ie|eu)\b/;

// Shops that are hard-blocked: US-only retail chains and resale/C2C platforms
// that don't ship to Germany or create customs/VAT complications.
const BLOCKED_SHOPS = [
  "walmart", "target", "macy", "nordstrom",
  "kohls", "kohl's", "jcpenney", "sears", "belk", "dillards",
  "tj maxx", "tjmaxx", "ross ", "bloomingdale", "neiman marcus",
  "saks fifth", "footaction", "champs sports",
  "dick's sporting", "academy sports",
  "stockx", "goat", "grailed", "depop", "poshmark", "mercari",
  "ebay.com", "amazon.com",
];

// All shops known to ship reliably to Germany (used for shopScore bonus only).
const SHIPS_TO_DE = [
  // German generalists
  "zalando", "about you", "aboutyou", "breuninger",
  "peek & cloppenburg", "peek cloppenburg",
  "snipes", "bstn", "solebox", "hhv",
  "asphaltgold", "43einhalb", "footpatrol", "overkill",
  "planet sports", "görtz", "goertz", "deichmann",
  "foot locker", "footlocker", "jd sports",
  "footshop", "sizeer", "intersport", "decathlon",
  // EU / international premium
  "farfetch", "mytheresa", "ssense",
  "mr porter", "mrporter", "net-a-porter", "netaporter",
  "yoox", "luisaviaroma", "luisa via roma",
  "end.", "end clothing",
  "matches", "cettire", "baltini", "italist",
  // Brand direct (all have DE storefronts or ship to Germany)
  "nike", "adidas", "puma", "reebok",
  "converse", "vans", "new balance",
  "ralph lauren", "lacoste", "tommy", "hugo boss", "boss",
  "cp company", "stone island", "moncler",
  "north face", "patagonia", "canada goose",
  "levi", "gap", "uniqlo", "cos", "arket",
  "gucci", "prada", "versace", "burberry", "dior",
  "galeries lafayette", "el corte ingles", "la redoute",
  "c&a", "humanic", "planet sports",
];

/**
 * Returns true if this result is from a shop that ships to Germany without
 * customs/VAT complications. Relies on Google Shopping gl=de geotargeting
 * to handle the bulk of the filtering; we only explicitly block US-only
 * retail and resale platforms.
 */
function shipsToGermany(m: PricedMatch): boolean {
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();
  return !BLOCKED_SHOPS.some((s) => src.includes(s) || href.includes(s.replace(/ /g, "")));
}

function filterReason(m: PricedMatch): string {
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();
  const currency = normalizeCurrency(m.price.currency);
  if (BLOCKED_SHOPS.some((s) => src.includes(s) || href.includes(s.replace(/ /g, "")))) return "blocked_shop";
  if (currency === "€") return "passes(eur)";
  if (EU_TLD.test(href)) return "passes(eu_tld)";
  if (SHIPS_TO_DE.some((s) => src.includes(s))) return "passes(known_de_shop)";
  return `passes(unknown:cur=${currency || "?"})`;
}

// ---------------------------------------------------------------------------
// Shop priority scoring — 7 tiers + image bonus
// ---------------------------------------------------------------------------

// Category-based site: query targets. Sneaker searches go to sneaker shops,
// fashion goes to fashion shops, luxury to luxury shops.
const SNEAKER_SITES = [
  "nike.com", "adidas.com",
  "zalando.de", "aboutyou.de",
  "foot-locker.de", "jdsports.de",
  "endclothing.com", "snipes.com",
  "bstn.com", "solebox.com",
] as const;

const FASHION_SITES = [
  "zalando.de", "aboutyou.de",
  "breuninger.com", "peek-cloppenburg.de",
  "farfetch.com", "mytheresa.com",
  "mrporter.com", "ssense.com",
] as const;

const LUXURY_SITES = [
  "farfetch.com", "mytheresa.com",
  "luisaviaroma.com", "mrporter.com",
  "cettire.com", "ssense.com",
] as const;

// Luxury brands whose products should be routed to luxury shop targets.
const LUXURY_BRAND_NAMES = [
  "gucci", "prada", "louis vuitton", "chanel", "dior",
  "balenciaga", "versace", "burberry", "moncler",
  "stone island", "cp company", "canada goose",
  "arc'teryx", "arcteryx", "parajumpers",
];

function getTargetSites(analysis: ProductAnalysis | null): readonly string[] {
  if (!analysis) return FASHION_SITES;
  const cat = analysis.category.toLowerCase();
  const type = analysis.productType.toLowerCase();
  const brand = (analysis.brand || analysis.brandCandidates?.[0] || "").toLowerCase();

  const isSneaker =
    /schuh|sneaker/.test(cat) ||
    /air max|air force|samba|jordan|chuck|yeezy|ultra boost|forum|superstar|gazelle|campus|stan smith|cortez|dunk|blazer/i.test(type);
  const isLuxury = LUXURY_BRAND_NAMES.some((b) => brand.includes(b));

  if (isSneaker) return SNEAKER_SITES;
  if (isLuxury) return LUXURY_SITES;
  return FASHION_SITES;
}

function shopScore(m: PricedMatch): number {
  const src = (m.source ?? "").toLowerCase();
  const href = (m.link ?? "").toLowerCase();
  const hasImage = Boolean(m.image ?? m.thumbnail);
  const currency = normalizeCurrency(m.price.currency);

  let score = 0;
  if (SHIPS_TO_DE.some((s) => src.includes(s))) {
    // Known curated shop
    score = /\.de\b/.test(href) ? 80 : currency === "€" ? 70 : 55;
  } else if (currency === "€") {
    score = /\.de\b/.test(href) ? 65 : EU_TLD.test(href) ? 50 : 40;
  } else if (EU_TLD.test(href)) {
    score = 35;
  } else {
    score = 15;
  }

  if (hasImage) score += 15;
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
  // SerpAPI returns product URLs under several different field names depending
  // on the query type, engine version, and whether the result is a direct
  // merchant listing or a Google Shopping aggregation page.
  link?: string;
  product_link?: string;
  shopping_link?: string;
  serpapi_link?: string;
  inline_shopping_link?: string;
  direct_link?: string;
  merchant?: string;
  thumbnail?: string;
  extracted_price?: number;
  currency?: string;
  price?: string;
  // Catch-all for any other fields in the raw response
  [key: string]: unknown;
};

function getBestProductUrl(r: ShoppingApiResult): string | undefined {
  // Prefer direct merchant URLs over Google-hosted intermediary pages.
  // product_link / shopping_link typically point to google.com/shopping/…
  // which is still a valid, clickable destination even if not the merchant directly.
  const candidate =
    r.link ||
    r.direct_link ||
    r.product_link ||
    r.shopping_link ||
    r.inline_shopping_link ||
    r.serpapi_link;
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate.trim() : undefined;
}

// Exported so the debug endpoint and tests can reuse the type.
export type ProductAnalysis = {
  // ── Identity (Stage 1 output: WHO is this product?) ──────────────────────
  brand: string;               // "Nike" | "adidas" | "C.P. Company" | "" if not visible
  model: string;               // "Air Max 90" | "Samba OG" | "982T" | "" if not recognizable
  productType: string;         // "Sneaker" | "Polo T-Shirt" | "Daunenjacke" | ...
  category: string;            // Shirt | Jacke | Schuhe | Hose | Hoodie | Uhr | Tasche | ...
  gender: string;              // "Herren" | "Damen" | "Unisex" | ""
  // ── Colors ────────────────────────────────────────────────────────────────
  primaryColor: string;        // precise German: "weiß" | "navy blau" | "schwarz"
  secondaryColor: string;      // single most prominent second color, "" if none
  secondaryColors: string[];   // all secondary colors ["rot","weiß"]
  // ── Construction (used by refineWithOpenAI scoring) ───────────────────────
  material: string;
  pattern: string;
  fit: string;
  sleeveLength: string;
  neckline: string;
  hood: boolean;
  zipper: boolean;
  pockets: string;
  // ── Branding ──────────────────────────────────────────────────────────────
  logoPosition: string;
  logoColor: string;
  logoDescription: string;     // "white Nike swoosh on side" | "small Polo pony on chest" | ""
  brandCandidates: string[];
  // ── Free-text
  distinctiveFeatures: string; // e.g. "Gooseneck-Tasche, reflektierender Streifen"
  // ── Search queries (Stage 2 input: HOW to find this product) ─────────────
  confidence: number;          // 0–100: how certain is the identification
  exactProductQuery: string;   // best single English query: "Nike Air Max 90 Triple White"
  fallbackQueries: string[];   // 2–3 progressively broader fallback queries
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
  scores: number[];       // one score per candidate (0–100), same order as input
  originalIndex: number;  // index of the best overall match for the photo
  topIndices: number[];   // up to 8 indices sorted by relevance (best first), starts with originalIndex
  productName: string;
  brand: string;
  category: string;
  confidence: number;
  matchQuality: MatchQuality;
};

// ---------------------------------------------------------------------------
// SerpAPI Google Shopping — text-based product search
// ---------------------------------------------------------------------------

type TextSearchResult = { priced: PricedMatch[]; rawCount: number; rawDebug: QueryRawDebug };

// Broad response type so we can inspect every field SerpAPI sends back.
type SerpApiRawResponse = {
  search_metadata?: { status?: string; total_time_taken?: number; id?: string };
  search_parameters?: Record<string, string>;
  search_information?: { total_results?: string; query_displayed?: string };
  error?: string;
  shopping_results?: ShoppingApiResult[];
  inline_shopping_results?: ShoppingApiResult[];
  organic_results?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

async function textSearch(query: string, apiKey: string): Promise<TextSearchResult> {
  // ── Build request params ──────────────────────────────────────────────────
  const params: Record<string, string> = {
    engine:        "google_shopping",
    q:             query,
    google_domain: "google.de",
    gl:            "de",
    hl:            "de",
    location:      "Germany",
    num:           "40",
  };

  const url = new URL(SERPAPI_ENDPOINT);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey);

  console.log(`[textSearch] REQUEST "${query}" params=${JSON.stringify(params)}`);

  // Minimal rawDebug returned on all error paths so callers always get an object.
  const emptyDebug = (): QueryRawDebug => ({
    requestParams: params,
    httpStatus: 0,
    responseKeys: [],
    sampleProducts: [],
    chosenField: "(none)",
  });

  try {
    const response = await fetch(url.toString());
    console.log(`[textSearch] HTTP ${response.status} for "${query}"`);

    const bodyText = await response.text();

    if (!response.ok) {
      console.error(`[textSearch] HTTP error body: ${bodyText.slice(0, 500)}`);
      return { priced: [], rawCount: 0, rawDebug: { ...emptyDebug(), httpStatus: response.status, serpError: bodyText.slice(0, 500) } };
    }

    let data: SerpApiRawResponse;
    try {
      data = JSON.parse(bodyText) as SerpApiRawResponse;
    } catch {
      console.error(`[textSearch] JSON parse failed: ${bodyText.slice(0, 300)}`);
      return { priced: [], rawCount: 0, rawDebug: { ...emptyDebug(), httpStatus: response.status, serpError: `JSON parse failed: ${bodyText.slice(0, 300)}` } };
    }

    // ── Build structured response key inventory ───────────────────────────
    const META_KEYS = new Set(["search_metadata", "search_parameters", "search_information", "error"]);
    const responseKeys: QueryResponseKey[] = Object.keys(data).map((key) => {
      const val = data[key];
      if (Array.isArray(val)) return { key, type: "array" as const, count: val.length };
      if (val === null)       return { key, type: "null" as const };
      const t = typeof val;
      if (t === "string" || t === "number" || t === "boolean") return { key, type: t, count: undefined };
      if (t === "object")     return { key, type: "object" as const };
      return { key, type: "unknown" as const };
    });

    // Log concise summary
    console.log(`[SERP] keys: ${responseKeys.map((k) => `${k.key}${k.type === "array" ? `[${k.count}]` : ""}`).join(", ")}`);
    if (data.error) console.error(`[SERP] error: ${data.error}`);

    // ── Collect first 3 items from every candidate product array ─────────
    const CANDIDATE_KEYS = [
      "shopping_results", "inline_shopping_results", "organic_results",
      "products", "shopping", "related_products", "product_results",
      "local_results", "related_shopping_results", "immersive_products",
      "visual_matches", "images_results",
    ];

    const sampleProducts = CANDIDATE_KEYS
      .filter((key) => Array.isArray(data[key]) && (data[key] as unknown[]).length > 0)
      .map((key) => ({ field: key, items: (data[key] as unknown[]).slice(0, 3) }));

    // ── Pick the best result array ────────────────────────────────────────
    let raw: ShoppingApiResult[] = [];
    let chosenKey = "(none)";

    for (const key of CANDIDATE_KEYS) {
      const arr = data[key];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const first = arr[0] as Record<string, unknown>;
      const hasTitle = typeof first.title === "string" || typeof first.name === "string";
      const hasPrice = first.price !== undefined || first.extracted_price !== undefined || first.prices !== undefined;
      if (hasTitle || hasPrice) {
        raw = arr as ShoppingApiResult[];
        chosenKey = key;
        break;
      }
    }

    console.log(`[textSearch] "${query}" → ${raw.length} raw from field "${chosenKey}"`);

    const rawDebug: QueryRawDebug = {
      requestParams: params,
      httpStatus: response.status,
      responseKeys,
      serpError:            data.error ? String(data.error) : undefined,
      serpMetadata:         data.search_metadata as Record<string, unknown> | undefined,
      serpSearchParameters: data.search_parameters,
      serpSearchInformation:data.search_information as Record<string, unknown> | undefined,
      sampleProducts,
      chosenField: chosenKey,
    };

    const priced = raw
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
          link: getBestProductUrl(r),
          thumbnail: r.thumbnail,
          price: { extracted_value: extractedPrice, currency },
        };
      })
      .filter((m): m is PricedMatch => m !== null);

    return { priced, rawCount: raw.length, rawDebug };
  } catch (err) {
    console.error("[textSearch] Fehler:", err);
    return { priced: [], rawCount: 0, rawDebug: { ...emptyDebug(), serpError: String(err) } };
  }
}

// ---------------------------------------------------------------------------
// GPT Vision — two-stage: IDENTIFY the product, then GENERATE search queries.
// ---------------------------------------------------------------------------

// Well-known sneaker models to help GPT recognize specific silhouettes/details.
const SNEAKER_MODEL_HINTS = [
  "Nike: Air Max 90, Air Max 95, Air Max 97, Air Force 1, Dunk Low, Dunk High, Jordan 1, Jordan 4, Cortez, Blazer",
  "adidas: Samba, Samba OG, Gazelle, Campus, Stan Smith, Superstar, Forum Low, Forum High, NMD, Ultraboost, Handball Spezial",
  "New Balance: 530, 574, 990, 9060, 2002R, 327, 1906R",
  "Asics: Gel-Kayano, Gel-Lyte III, Gel-Nimbus, Gel-1090",
  "Converse: Chuck Taylor All Star, Chuck 70, Run Star, One Star",
  "Vans: Old Skool, Authentic, Era, Slip-On, Sk8-Hi",
  "Puma: Suede Classic, Clyde, Speedcat",
].join(" | ");

// Three concrete few-shot examples matching the user's test products.
const IDENTITY_EXAMPLES = [
  {
    scenario: "Nike Air Max 90 Triple White sneaker",
    output: {
      brand: "Nike", model: "Air Max 90", productType: "Sneaker", category: "Schuhe",
      gender: "Unisex", primaryColor: "weiß", secondaryColor: "",
      distinctiveFeatures: "triple white colorway, visible Air cushion heel unit, waffle outsole, mesh upper with leather overlays",
      logoDescription: "white Nike swoosh on side panel",
      confidence: 95,
      exactProductQuery: "Nike Air Max 90 Triple White",
      fallbackQueries: ["Nike Air Max 90 White", "Air Max 90 Triple White", "Nike white sneakers"],
    },
  },
  {
    scenario: "adidas Samba OG white with black stripes",
    output: {
      brand: "adidas", model: "Samba OG", productType: "Sneaker", category: "Schuhe",
      gender: "Unisex", primaryColor: "weiß", secondaryColor: "schwarz",
      distinctiveFeatures: "low profile, gum sole, T-toe overlay, suede toe cap",
      logoDescription: "three black stripes on side, adidas Trefoil on tongue",
      confidence: 92,
      exactProductQuery: "adidas Samba OG white black",
      fallbackQueries: ["adidas Samba white black gum sole", "adidas Samba OG", "adidas Samba white"],
    },
  },
  {
    scenario: "Polo Ralph Lauren navy blue polo shirt",
    output: {
      brand: "Ralph Lauren", model: "", productType: "Polo T-Shirt", category: "Shirt",
      gender: "Herren", primaryColor: "navy blau", secondaryColor: "",
      distinctiveFeatures: "ribbed collar and cuffs, two-button placket, embroidered Polo pony on chest",
      logoDescription: "small embroidered Polo pony rider on left chest",
      confidence: 88,
      exactProductQuery: "Polo Ralph Lauren Navy Polo Shirt",
      fallbackQueries: ["Ralph Lauren polo navy blue", "Polo Ralph Lauren Herren Poloshirt navy"],
    },
  },
  {
    scenario: "C.P. Company black padded down jacket with lens goggle on hood",
    output: {
      brand: "C.P. Company", model: "", productType: "Daunenjacke", category: "Jacke",
      gender: "Herren", primaryColor: "schwarz", secondaryColor: "",
      distinctiveFeatures: "shiny padded quilted shell, integrated goggle lens on hood, ribbed cuffs, two front zip pockets",
      logoDescription: "C.P. Company logo patch on sleeve, lens goggle integrated in hood",
      confidence: 90,
      exactProductQuery: "C.P. Company black down jacket lens goggle hood",
      fallbackQueries: ["C.P. Company black puffer jacket goggle", "C.P. Company hooded down jacket black", "CP Company black padded jacket"],
    },
  },
];

export async function analyzeImageWithGPT(imageUrl: string): Promise<ProductAnalysis | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  const fields: (keyof ProductAnalysis)[] = [
    "brand", "model", "productType", "category", "gender",
    "primaryColor", "secondaryColor", "secondaryColors",
    "material", "pattern", "fit", "sleeveLength", "neckline",
    "hood", "zipper", "pockets",
    "logoPosition", "logoColor", "logoDescription", "brandCandidates",
    "distinctiveFeatures",
    "confidence", "exactProductQuery", "fallbackQueries",
  ];

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              {
                type: "text",
                text: [
                  "You are a fashion product identifier. Analyze the image in two steps:",
                  "",
                  "STEP 1 — IDENTIFY the product precisely:",
                  "• Look for brand logos, labels, hang tags, text on the product.",
                  "• For sneakers, match the silhouette/sole/upper to known models.",
                  `• Known sneaker models: ${SNEAKER_MODEL_HINTS}`,
                  "• For apparel, identify cut, collar, sleeve, fit, distinctive details.",
                  "• If you cannot identify the exact model, leave model=''.",
                  "",
                  "STEP 2 — GENERATE search queries (English, for Google Shopping):",
                  "• exactProductQuery: the single best query to find THIS exact product.",
                  "  Format: brand + model + key color(s) + distinctive name if any.",
                  "  NEVER use vague queries like 'white sneaker' or 'navy shirt'.",
                  "  Examples: 'Nike Air Max 90 Triple White' | 'adidas Samba OG white black' | 'C.P. Company black down jacket lens goggle'",
                  "• fallbackQueries: 2–3 progressively broader alternatives.",
                  "  Start with a close variant, get broader with each.",
                  "",
                  "Few-shot examples:",
                  ...IDENTITY_EXAMPLES.map((ex) =>
                    `Scenario: ${ex.scenario}\nOutput: ${JSON.stringify(ex.output)}`,
                  ),
                  "",
                  `Return JSON with exactly these fields: ${fields.join(", ")}`,
                  "",
                  "Field rules:",
                  "- brand: exact brand name if visible, '' if not",
                  "- model: specific model name ('Air Max 90', 'Samba OG', '574'), '' if not recognizable",
                  "- productType: specific type in German ('Crewneck T-Shirt', 'Daunenjacke', 'Sneaker')",
                  "- category: one of Shirt | Jacke | Schuhe | Hose | Hoodie | Uhr | Tasche | Gürtel | Brille | Kleid | Cap | Produkt",
                  "- primaryColor: precise German color ('navy blau', 'weiß', 'dunkelgrün'); secondaryColor: single most prominent second color",
                  "- confidence: 90+=model certain, 70–89=model likely, 50–69=brand only, <50=uncertain",
                  "- If no fashion product visible: productType='', exactProductQuery='', all strings='', arrays=[]",
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
    if (!parsed.productType && !parsed.exactProductQuery) {
      console.warn("[analyzeImageWithGPT] No product detected:", parsed);
      return null;
    }

    // Normalise: ensure arrays exist
    parsed.secondaryColors = parsed.secondaryColors ?? [];
    parsed.brandCandidates = parsed.brandCandidates ?? [];
    parsed.fallbackQueries = parsed.fallbackQueries ?? [];

    console.log("[analyzeImageWithGPT] Identity:");
    console.log(`  brand="${parsed.brand}" model="${parsed.model}" productType="${parsed.productType}" confidence=${parsed.confidence}`);
    console.log(`  exactProductQuery="${parsed.exactProductQuery}"`);
    console.log(`  fallbackQueries=[${parsed.fallbackQueries.map((q) => `"${q}"`).join(", ")}]`);
    console.log(`  primaryColor="${parsed.primaryColor}" secondaryColor="${parsed.secondaryColor}"`);
    console.log(`  logoDescription="${parsed.logoDescription}" distinctiveFeatures="${parsed.distinctiveFeatures}"`);

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
  debug?: DebugCollector,
): Promise<AnalysisResult | null> {
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
    const lensDE = lensPriced.filter(shipsToGermany);

    console.log(
      `[Stage 0] Lens: ${lensMatches.length} total, ${lensPriced.length} priced, ${lensDE.length} ships-to-DE`,
    );
    lensPriced.forEach((m, i) => {
      const reason = filterReason(m);
      console.log(
        `  L[${i}] "${m.title.slice(0, 45)}" | src="${m.source}" | cur="${m.price.currency}" | ${reason}`,
      );
    });

    // Record product identity for debug panel
    if (debug && productAnalysis) {
      debug.productIdentity = {
        brand: productAnalysis.brand,
        model: productAnalysis.model,
        productType: productAnalysis.productType,
        exactProductQuery: productAnalysis.exactProductQuery,
        fallbackQueries: productAnalysis.fallbackQueries ?? [],
        confidence: productAnalysis.confidence ?? 0,
      };
    }

    // Debug: record Lens call
    if (debug) {
      const lensRejected = lensPriced.filter((m) => !shipsToGermany(m));
      debug.push({
        query: "(Google Lens visual match)",
        engine: "google_lens",
        rawCount: lensMatches.length,
        pricedCount: lensPriced.length,
        withLinkCount: lensPriced.filter((m) => Boolean(m.link)).length,
        passedCount: lensDE.length,
        rejectedItems: lensRejected.map((m) => ({
          title: m.title.slice(0, 60),
          source: m.source ?? "",
          reason: filterReason(m),
        })),
      });
    }

    // ── Query plan ─────────────────────────────────────────────────────────
    // STAGE 1 output: exactProductQuery + fallbackQueries from GPT Vision.
    // These are always used when available — they name the exact model/product.
    // Algorithmic buildSearchQueries is only a fallback when GPT doesn't produce them.
    const seenQ = new Set<string>();
    const queryPlan: string[] = [];
    const addQ = (q: string | undefined) => {
      if (q && q.trim().length > 3 && queryPlan.length < MAX_SHOPPING_QUERIES && !seenQ.has(q.toLowerCase())) {
        seenQ.add(q.toLowerCase());
        queryPlan.push(q.trim());
      }
    };

    if (productAnalysis?.exactProductQuery) {
      // GPT gave us precise queries — use them directly.
      addQ(productAnalysis.exactProductQuery);
      for (const fq of (productAnalysis.fallbackQueries ?? [])) addQ(fq);
      console.log(`[Stage 1] Using GPT identity queries (conf=${productAnalysis.confidence}):`);
    } else {
      // Algorithmic fallback: derive queries from structured fields.
      const allQueries: SearchQuery[] = productAnalysis ? buildSearchQueries(productAnalysis) : [];
      const brandQueries = allQueries.filter(
        (q) => q.strategy.startsWith("brand") || q.strategy.startsWith("altbrand"),
      );
      const nobrandQueries = allQueries.filter(
        (q) => !q.strategy.startsWith("brand") && !q.strategy.startsWith("altbrand"),
      );
      addQ(brandQueries[0]?.query);
      addQ(brandQueries[1]?.query);
      addQ(nobrandQueries[0]?.query);
      console.log(`[Stage 1] Algorithmic fallback queries (GPT gave no exactProductQuery):`);
    }

    console.log(`[Shopping] Plan: ${queryPlan.length} queries (max ${MAX_SHOPPING_QUERIES}):`);
    queryPlan.forEach((q, i) => console.log(`  P[${i}] "${q}"`));

    let candidates: PricedMatch[] = [...lensDE];
    let hadAnyPricedResults = lensPriced.length > 0;

    // Helper: run one textSearch call, filter, log, push to debug, merge into candidates.
    const runQuery = async (q: string): Promise<void> => {
      const { priced, rawCount, rawDebug } = await textSearch(q, apiKey);
      const passed = priced.filter(shipsToGermany);
      const rejected = priced.filter((m) => !shipsToGermany(m));
      hadAnyPricedResults = hadAnyPricedResults || priced.length > 0;

      console.log(`[Shopping] "${q.slice(0, 70)}" → ${rawCount} roh, ${priced.length} priced, ${passed.length} passes`);

      if (debug) {
        debug.push({
          query: q,
          engine: "google_shopping",
          rawCount,
          pricedCount: priced.length,
          withLinkCount: priced.filter((m) => Boolean(m.link)).length,
          passedCount: passed.length,
          rejectedItems: rejected.map((m) => ({
            title: m.title.slice(0, 60),
            source: m.source ?? "",
            reason: filterReason(m),
          })),
          raw: rawDebug,
        });
      }

      candidates = deduplicate([...candidates, ...passed]);
    };

    // -----------------------------------------------------------------------
    // Shopping: fire Q1 alone; if sparse, fire remaining in parallel.
    // Two HTTP round trips at most (Q1 solo → [Q2, Q3] parallel if needed).
    // -----------------------------------------------------------------------
    if (queryPlan.length > 0) {
      await runQuery(queryPlan[0]);
      const linkedAfterQ1 = candidates.filter((m) => Boolean(m.link)).length;
      console.log(`[Shopping] After Q1: ${candidates.length} candidates, ${linkedAfterQ1} with link`);

      if (linkedAfterQ1 < EARLY_EXIT_LINKED && queryPlan.length > 1) {
        console.log(`[Shopping] Sparse (${linkedAfterQ1} < ${EARLY_EXIT_LINKED}) — firing ${queryPlan.length - 1} more in parallel`);
        await Promise.all(queryPlan.slice(1).map(runQuery));
        const linkedFinal = candidates.filter((m) => Boolean(m.link)).length;
        console.log(`[Shopping] Final pool: ${candidates.length} candidates, ${linkedFinal} with link`);
      } else if (linkedAfterQ1 >= EARLY_EXIT_LINKED) {
        console.log(`[Shopping] Early exit: ${linkedAfterQ1} linked >= ${EARLY_EXIT_LINKED}`);
      }
    }

    // Record final candidate pool for debug before finalization
    if (debug) {
      debug.finalCandidateCount = candidates.length;
      debug.finalProducts = candidates.slice(0, 30).map((m) => ({
        title: m.title.slice(0, 60),
        store: m.source ?? "",
        price: m.price.extracted_value,
        link: m.link,
      }));
    }

    // Finalize once with the full combined pool from Stage 1 + Stage 2.
    if (candidates.length >= MIN_EU_MATCHES) {
      const sorted = candidates.sort((a, b) => shopScore(b) - shopScore(a));
      const result = await finalizeResult(imageUrl, sorted, productAnalysis);
      if (result) return result;
    }

    // -----------------------------------------------------------------------
    // Stage 3: LAST RESORT — any 1+ result is better than nothing.
    // Pad with all Lens priced matches that have links if candidates is sparse.
    // -----------------------------------------------------------------------
    if (candidates.length > 0 && candidates.length < MIN_EU_MATCHES) {
      const extras = lensPriced.filter((m) => Boolean(m.link) && !candidates.includes(m));
      const padded = deduplicate([...candidates, ...extras]).slice(0, MIN_EU_MATCHES);
      if (padded.length >= MIN_EU_MATCHES) {
        const sorted = padded.sort((a, b) => shopScore(b) - shopScore(a));
        const result = await finalizeResult(imageUrl, sorted, productAnalysis);
        if (result) return result;
      }
    }

    console.log("─────────────────────────────────────────────────────");
    console.log("[PIPELINE SUMMARY] All stages exhausted without result.");
    console.log(`  hadAnyPricedResults : ${hadAnyPricedResults}`);
    console.log(`  candidates.length   : ${candidates.length} (MIN_EU_MATCHES=${MIN_EU_MATCHES})`);
    console.log(`  lensMatches.length  : ${lensMatches.length}`);
    console.log(`  lensPriced.length   : ${lensPriced.length}`);
    console.log(`  lensDE.length       : ${lensDE.length}`);
    console.log(`  queryPlan.length    : ${queryPlan.length}`);
    console.log(`  RETURN              : ${hadAnyPricedResults ? "no_match" : "null"}`);
    console.log("─────────────────────────────────────────────────────");
    return null;
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
  return (result.originalProduct.link ? 1 : 0) +
    result.alternatives.filter((a) => Boolean(a.link)).length;
}

async function finalizeResult(
  imageUrl: string,
  sorted: PricedMatch[],
  productAnalysis: ProductAnalysis | null,
): Promise<AnalysisResult | null> {
  console.log(`[finalizeResult] ENTER: sorted.length=${sorted.length}, need MIN_EU_MATCHES=${MIN_EU_MATCHES}`);
  sorted.slice(0, 8).forEach((m, i) =>
    console.log(`  POOL[${i}] "${m.title.slice(0, 50)}" | src="${m.source}" | price=${m.price.extracted_value} ${m.price.currency ?? "?"} | link=${m.link ? m.link.slice(0, 70) : "NO-LINK"}`),
  );

  if (sorted.length < MIN_EU_MATCHES) {
    console.warn(`[finalizeResult] EXIT: sorted.length=${sorted.length} < MIN_EU_MATCHES=${MIN_EU_MATCHES} → null`);
    return null;
  }

  // Items without a product link are useless — they would produce unclickable cards.
  // Lens visual_matches often land here with no link; Shopping results always have one.
  const withLinks = sorted.filter((m) => Boolean(m.link));
  const withoutLinks = sorted.filter((m) => !Boolean(m.link));
  console.log(`[finalizeResult] link-partition: ${withLinks.length} with links, ${withoutLinks.length} without`);
  withoutLinks.forEach((m, i) =>
    console.log(`  NOLINK[${i}] "${m.title.slice(0, 50)}" @ ${m.source ?? "?"} — Lens visual match, no product URL`),
  );

  if (withLinks.length === 0) {
    console.warn(`[finalizeResult] EXIT: ${sorted.length} items in pool but 0 have product links (all Lens visual matches) → null`);
    return null;
  }

  // Only pass linked items forward — GPT indices and heuristic picks must all resolve to clickable products.
  const linkedPool = withLinks;

  let candidate: AnalysisResult | null = null;
  if (getOpenAIKey()) {
    console.log(`[finalizeResult] Calling GPT refinement with ${Math.min(linkedPool.length, MAX_GPT_MATCHES)} linked candidates`);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const gptTimeoutPromise = new Promise<null>(
      (resolve) => { timeoutId = setTimeout(() => resolve(null), GPT_TIMEOUT_MS); },
    );
    const gptResult = await Promise.race([
      refineWithOpenAI(imageUrl, linkedPool.slice(0, MAX_GPT_MATCHES), productAnalysis),
      gptTimeoutPromise,
    ]);
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (gptResult === null) {
      console.warn("[finalizeResult] GPT returned null (timeout or score<40) → falling back to heuristic");
    } else {
      console.log(`[finalizeResult] GPT succeeded: "${gptResult.originalProduct.name}" matchQuality=${gptResult.matchQuality}`);
    }
    candidate = gptResult ?? buildResultFromPriced(linkedPool);
  } else {
    console.log("[finalizeResult] No OpenAI key — using heuristic builder");
    candidate = buildResultFromPriced(linkedPool);
  }

  if (!candidate) {
    console.warn("[finalizeResult] EXIT: candidate=null after GPT+heuristic → null");
    return null;
  }

  const linked = countLinks(candidate);
  console.log(`[finalizeResult] countLinks=${linked}/4`);
  if (linked < 1) {
    console.warn(`[finalizeResult] EXIT: 0 items have product links → null`);
    return null;
  }

  console.log(`[finalizeResult] SUCCESS: "${candidate.originalProduct.name}" @ ${candidate.originalProduct.store} ${candidate.originalProduct.price}€`);
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

  if (priced.length < MIN_FOR_GPT) {
    console.warn(`[refineWithOpenAI] ${priced.length} candidates < ${MIN_FOR_GPT} → heuristic`);
    return null;
  }

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
        `  1. Color = "${productAnalysis.primaryColor}" (wrong color → score ≤55)`,
        `  2. Type = "${productAnalysis.productType}" (wrong type → score ≤55)`,
        (productAnalysis.brand || productAnalysis.brandCandidates?.length)
          ? `  3. Brand = ${productAnalysis.brand || productAnalysis.brandCandidates.join(" or ")} (wrong brand → −35 pts)`
          : `  3. Brand: not required (not visible)`,
      ].filter(Boolean).join(" ")
    : "Match by COLOR first, then product type, then brand.";

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 700,
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
                  `Shop candidates (all ship to Germany): ${JSON.stringify(matchList)}`,
                  "",
                  "STEP 1 — Score each candidate 0–100:",
                  "  +35 pts: brand matches",
                  "  +35 pts: color matches exactly (navy ≠ white/grey/black; black ≠ navy)",
                  "  +20 pts: product type matches exactly (T-Shirt ≠ Polo ≠ Hoodie; Sneaker ≠ Boot)",
                  "  +10 pts: logo / detail matches",
                  "  HARD: wrong color → cap at 55. Wrong product type → cap at 55.",
                  "",
                  "STEP 2 — Set originalIndex: highest-scored candidate (must be ≥40).",
                  "",
                  `STEP 3 — Build topIndices: up to ${MAX_ALTERNATIVES + 1} distinct indices sorted by score (highest first).`,
                  "  First element MUST be originalIndex.",
                  "  Include only candidates with score ≥40.",
                  "  All indices must be valid (0 to candidates.length-1) and distinct.",
                  "",
                  "STEP 4 — Set matchQuality from scores[originalIndex]: ≥90→'exact', 70–89→'similar', <70→'uncertain'.",
                  "",
                  `Return JSON: {"scores":[85,92,61,78,55,90],"originalIndex":1,"topIndices":[1,5,0,3],"productName":"Nike Air Max 90 Weiß","brand":"Nike","category":"Schuhe","confidence":92,"matchQuality":"exact"}`,
                  "",
                  "Rules: scores array length = candidates array length. productName = brand+color+name. category: Schuhe|Hoodie|Shirt|Jacke|Hose|Uhr|Tasche|Gürtel|Brille|Kleid|Produkt. confidence: 50–95.",
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

    // Validate originalIndex
    if (typeof gpt.originalIndex !== "number" || gpt.originalIndex < 0 || gpt.originalIndex >= priced.length) {
      console.error("[refineWithOpenAI] Invalid originalIndex:", gpt.originalIndex);
      return null;
    }

    // Build topIndices: use GPT's list, validate each, fall back to score-sorted order
    const scores: number[] = Array.isArray(gpt.scores) ? gpt.scores : [];
    let topIndices: number[] = Array.isArray(gpt.topIndices)
      ? gpt.topIndices.filter((i): i is number => typeof i === "number" && i >= 0 && i < priced.length)
      : [];

    // Ensure originalIndex is first and list is unique
    topIndices = [gpt.originalIndex, ...topIndices.filter((i) => i !== gpt.originalIndex)];
    topIndices = [...new Set(topIndices)].slice(0, MAX_ALTERNATIVES + 1);

    // If GPT returned no extras, fill from score-sorted order
    if (topIndices.length < 2 && scores.length > 0) {
      const sorted = scores
        .map((s, i) => ({ s, i }))
        .sort((a, b) => b.s - a.s)
        .filter(({ i }) => !topIndices.includes(i) && i < priced.length)
        .map(({ i }) => i);
      topIndices = [...topIndices, ...sorted].slice(0, MAX_ALTERNATIVES + 1);
    }

    const originalScore = typeof scores[gpt.originalIndex] === "number"
      ? scores[gpt.originalIndex]
      : (gpt.matchQuality === "exact" ? 92 : gpt.matchQuality === "similar" ? 75 : 55);

    console.log(`[refineWithOpenAI] originalIndex=${gpt.originalIndex} score=${originalScore} topIndices=[${topIndices.join(",")}]`);
    console.log(`[refineWithOpenAI] scores: ${scores.map((s, i) => `[${i}]=${s}`).join(" ")}`);
    scores.forEach((s, i) => {
      if (i < priced.length) {
        console.log(`  SCORE[${i}]=${s} "${priced[i].title.slice(0, 50)}" @ ${priced[i].source}`);
      }
    });

    if (originalScore < 40) {
      console.warn(`[refineWithOpenAI] EXIT: score=${originalScore} < 40 → null`);
      return null;
    }

    const matchQuality: MatchQuality =
      originalScore >= 90 ? "exact" :
      originalScore >= 70 ? "similar" :
      "uncertain";

    const original = priced[topIndices[0]];
    const altItems = topIndices.slice(1).map((i) => priced[i]);
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

    // Assign roles: best=highest scored alt, cheapest/premium by price, rest=other
    const roleMap = new Map<PricedMatch, AlternativeProduct["role"]>();
    if (altItems[0]) roleMap.set(altItems[0], "best");
    const byPrice = [...altItems].sort((a, b) => a.price.extracted_value - b.price.extracted_value);
    if (byPrice[0] && !roleMap.has(byPrice[0])) roleMap.set(byPrice[0], "cheapest");
    if (byPrice[byPrice.length - 1] && !roleMap.has(byPrice[byPrice.length - 1])) {
      roleMap.set(byPrice[byPrice.length - 1], "premium");
    }
    const alternatives: AlternativeProduct[] = altItems.map((item) =>
      toAlt(item, roleMap.get(item) ?? "other"),
    );

    console.log(
      `[refineWithOpenAI] matchQuality="${matchQuality}" score=${originalScore} | "${original.title.slice(0, 40)}" @ ${original.source} | ${alternatives.length} alts`,
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
      alternatives,
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
  if (priced.length < 1) return null;

  const [original, ...rest] = priced.slice(0, MAX_ALTERNATIVES + 1);
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

  // Assign roles by price within the alt list; deduplicate by link.
  const byPrice = [...rest].sort((a, b) => a.price.extracted_value - b.price.extracted_value);
  const roleMap = new Map<PricedMatch, AlternativeProduct["role"]>();
  if (rest[0]) roleMap.set(rest[0], "best");               // highest shop score (list is score-sorted)
  if (byPrice[0] && !roleMap.has(byPrice[0])) roleMap.set(byPrice[0], "cheapest");
  if (byPrice[byPrice.length - 1] && !roleMap.has(byPrice[byPrice.length - 1])) {
    roleMap.set(byPrice[byPrice.length - 1], "premium");
  }

  const usedLinks = new Set<string>([original.link ?? ""]);
  const alternatives: AlternativeProduct[] = rest
    .map((item) => toAlt(item, roleMap.get(item) ?? "other"))
    .filter((alt) => {
      if (!alt.link || usedLinks.has(alt.link)) return false;
      usedLinks.add(alt.link);
      return true;
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
    confidence: Math.min(95, 50 + priced.length * 4),
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    matchQuality: "uncertain",
    alternatives,
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
