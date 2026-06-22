import { catalog } from "../catalog";
import type { AlternativeProduct, PriceRange, ProductSummary } from "../analysis-types";
import type { VisionAnalysis } from "./vision-service";

export type ProductSearchResult = {
  original: Pick<ProductSummary, "store" | "price">;
  priceRange: PriceRange;
  alternatives: {
    best: AlternativeProduct;
    cheapest: AlternativeProduct;
    premium: AlternativeProduct;
  };
};

/**
 * true, sobald SERPAPI_KEY gesetzt ist. Aktuell nicht konfiguriert
 * (siehe .env.example).
 */
export function isProductSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

/**
 * Sucht Originalpreis, Preisbereich und Alternativen (beste/günstigste/
 * Premium) zu einem erkannten Produkt.
 *
 * Ohne konfigurierten SERPAPI_KEY liefert diese Funktion Daten aus dem
 * bestehenden Dummy-Katalog zurück (identischer Fallback wie der bisherige
 * Client-Flow aus Phase 3).
 *
 * Mit konfiguriertem Key ist hier bewusst noch KEIN echter API-Aufruf
 * implementiert (Phase 5 = Infrastruktur, keine Kosten). Das ist der Punkt,
 * an dem Phase 6 die Anbindung an die SerpAPI Google Lens API einsetzt.
 */
export async function findComparableProducts(
  identified: VisionAnalysis,
): Promise<ProductSearchResult> {
  if (!isProductSearchConfigured()) {
    return dummyProductSearch(identified);
  }

  throw new Error(
    "SERPAPI_KEY gefunden, aber die echte Integration ist noch nicht implementiert (Phase 6).",
  );
}

function dummyProductSearch(identified: VisionAnalysis): ProductSearchResult {
  const product =
    catalog.find((entry) => entry.name === identified.name) ?? catalog[0];

  const alternatives = product.alternatives.map((alt) => ({
    ...alt,
    savingsPercent: Math.round((1 - alt.price / product.originalPrice) * 100),
  }));

  const prices = [product.originalPrice, ...alternatives.map((alt) => alt.price)];

  const [best, cheapest, premium] = (
    ["best", "cheapest", "premium"] as const
  ).map((role) => alternatives.find((alt) => alt.role === role)!);

  return {
    original: { store: product.originalStore, price: product.originalPrice },
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    alternatives: { best, cheapest, premium },
  };
}
