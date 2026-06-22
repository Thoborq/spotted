import type { AlternativeRole } from "./catalog";

export type ProductSummary = {
  name: string;
  brand: string;
  store: string;
  price: number;
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
};

/**
 * Gemeinsames Ergebnis-Datenmodell der Analyse-Pipeline.
 * Wird sowohl vom Dummy-Fallback als auch (ab Phase 6) von den echten
 * Vision-/Produktsuche-Services in genau dieser Form zurückgegeben.
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
