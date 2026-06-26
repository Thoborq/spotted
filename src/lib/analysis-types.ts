import type { AlternativeRole } from "./catalog";

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
  alternatives: {
    best: AlternativeProduct;
    cheapest: AlternativeProduct;
    premium: AlternativeProduct;
  };
};

/**
 * Antwortformat von POST /api/analyze. Unterscheidet bewusst zwischen einem
 * echten Treffer und den beiden Nicht-Treffer-Fällen, damit das Frontend nie
 * ein erfundenes Ergebnis anstelle einer echten Analyse anzeigt:
 *
 * - "ok": echter SerpAPI-Treffer, `result` ist real.
 * - "not_configured": kein SERPAPI_KEY gesetzt - Produkterkennung ist
 *   schlicht noch nicht aktiviert.
 * - "no_match": SerpAPI war erreichbar, hat aber kein verwertbares
 *   Ergebnis geliefert (zu wenige Treffer, API-Fehler, o.ä.).
 */
export type AnalyzeResponse =
  | { status: "ok"; result: AnalysisResult }
  | { status: "not_configured" }
  | { status: "no_match" };
