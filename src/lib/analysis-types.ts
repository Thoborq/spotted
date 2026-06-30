import type { AlternativeRole } from "./catalog";

export type MatchQuality = "exact" | "similar" | "uncertain";

export type ProductSummary = {
  name: string;
  brand: string;
  store: string;
  price: number;
  imageUrl?: string;
  link?: string;
};

export type PriceRange = {
  min: number;
  max: number;
};

export type AlternativeProduct = {
  role: AlternativeRole;
  name: string;
  store: string;
  price: number;
  savingsPercent: number;
  imageUrl?: string;
  link?: string;
  shipsFromNonEU?: boolean;
};

/**
 * Ergebnis-Datenmodell eines echten Treffers aus der Analyse-Pipeline
 * (SerpAPI Google Lens). Wird ausschließlich für echte Erkennungen
 * befüllt - nie mit erfundenen/Dummy-Werten.
 */
export type AnalysisResult = {
  originalProduct: ProductSummary;
  brand: string;
  category: string;
  confidence: number;
  priceRange: PriceRange;
  matchQuality: MatchQuality;
  alternatives: AlternativeProduct[];
};

export type QueryDebug = {
  query: string;
  engine: string;
  rawCount: number;
  pricedCount: number;
  withLinkCount: number;
  passedCount: number;
  rejectedItems: Array<{ title: string; source: string; reason: string }>;
};

export type ProductIdentityDebug = {
  brand: string;
  model: string;
  productType: string;
  exactProductQuery: string;
  fallbackQueries: string[];
  confidence: number;
};

export type PipelineDebug = {
  totalRequests: number;
  productIdentity?: ProductIdentityDebug;
  queries: QueryDebug[];
  finalCandidateCount: number;
  finalProducts: Array<{ title: string; store: string; price: number; link?: string }>;
};

/**
 * Antwortformat von POST /api/analyze.
 *
 * - "ok": echter SerpAPI-Treffer, `result` ist real.
 * - "not_configured": kein SERPAPI_KEY gesetzt.
 * - "no_match": SerpAPI war erreichbar, kein verwertbares Ergebnis.
 * - "no_eu_shop": deprecated alias für no_match.
 *
 * `debug` ist immer befüllt und enthält die Suchpipeline-Daten.
 */
export type AnalyzeResponse =
  | { status: "ok"; result: AnalysisResult; debug?: PipelineDebug }
  | { status: "not_configured"; debug?: PipelineDebug }
  | { status: "no_match"; debug?: PipelineDebug }
  | { status: "no_eu_shop"; debug?: PipelineDebug };
