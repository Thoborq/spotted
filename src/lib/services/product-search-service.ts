import { del, put } from "@vercel/blob";
import { catalog } from "../catalog";
import type {
  AlternativeProduct,
  AnalysisResult,
  PriceRange,
  ProductSummary,
} from "../analysis-types";
import type { UploadedImage } from "../upload";
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

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const MIN_PRICED_MATCHES = 3;

/** true, sobald SERPAPI_KEY gesetzt ist. */
export function isProductSearchConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

type LensVisualMatch = {
  title?: string;
  source?: string;
  price?: { extracted_value?: number };
};

/**
 * Echte Bildsuche über die SerpAPI Google Lens API.
 *
 * SerpAPI Google Lens akzeptiert nur eine öffentlich erreichbare Bild-URL
 * (kein direkter Datei-Upload) - das Foto wird daher kurz über Vercel Blob
 * gehostet, an SerpAPI übergeben und direkt danach wieder gelöscht.
 *
 * Gibt null zurück, wenn kein SERPAPI_KEY gesetzt ist, der Aufruf fehlschlägt
 * oder zu wenige verwertbare (preisgelistete) Treffer gefunden wurden - der
 * Aufrufer fällt dann saubrer auf den Dummy-Katalog zurück.
 */
export async function searchWithGoogleLens(
  image: UploadedImage,
): Promise<AnalysisResult | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  let blobUrl: string | null = null;

  try {
    const extension = image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg";
    const blob = await put(`spotted-scans/${Date.now()}.${extension}`, image.buffer, {
      access: "public",
      contentType: image.mimeType,
    });
    blobUrl = blob.url;

    const url = new URL(SERPAPI_ENDPOINT);
    url.searchParams.set("engine", "google_lens");
    url.searchParams.set("url", blob.url);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`SerpAPI Google Lens antwortete mit HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { visual_matches?: LensVisualMatch[] };
    return buildResultFromMatches(data.visual_matches ?? []);
  } catch (error) {
    console.error("SerpAPI Google Lens Aufruf fehlgeschlagen:", error);
    return null;
  } finally {
    if (blobUrl) {
      await del(blobUrl).catch((error) => {
        console.error("Konnte temporären Blob nicht löschen:", error);
      });
    }
  }
}

function buildResultFromMatches(matches: LensVisualMatch[]): AnalysisResult | null {
  const priced = matches.filter(
    (match): match is LensVisualMatch & { title: string; price: { extracted_value: number } } =>
      typeof match.price?.extracted_value === "number" && Boolean(match.title),
  );

  if (priced.length < MIN_PRICED_MATCHES) return null;

  const original = priced[0];
  const sortedByPrice = [...priced].sort(
    (a, b) => a.price.extracted_value - b.price.extracted_value,
  );

  const cheapest = sortedByPrice[0];
  const premium = sortedByPrice[sortedByPrice.length - 1];
  const best = sortedByPrice[Math.floor(sortedByPrice.length / 2)];
  const prices = sortedByPrice.map((match) => match.price.extracted_value);

  const toAlternative = (
    match: LensVisualMatch & { title: string; price: { extracted_value: number } },
    role: AlternativeProduct["role"],
  ): AlternativeProduct => ({
    role,
    name: match.title,
    store: match.source ?? "Unbekannter Shop",
    price: match.price.extracted_value,
    savingsPercent: Math.max(
      0,
      Math.round((1 - match.price.extracted_value / original.price.extracted_value) * 100),
    ),
  });

  const brand = guessBrand(original.title);

  return {
    originalProduct: {
      name: original.title,
      brand,
      store: original.source ?? "Unbekannter Shop",
      price: original.price.extracted_value,
    },
    brand,
    category: "Produkt",
    confidence: Math.min(95, 50 + priced.length * 5),
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    alternatives: {
      best: toAlternative(best, "best"),
      cheapest: toAlternative(cheapest, "cheapest"),
      premium: toAlternative(premium, "premium"),
    },
  };
}

/** Naive Heuristik: erstes Wort eines Produkttitels ist häufig die Marke. */
function guessBrand(title: string): string {
  return title.trim().split(/\s+/)[0] || "Unbekannt";
}

/**
 * Dummy-Fallback: liefert Preis/Alternativen aus dem statischen Katalog,
 * unabhängig vom SERPAPI_KEY-Status. Wird verwendet, wenn searchWithGoogleLens
 * null zurückgibt (kein Key, Aufruf fehlgeschlagen oder zu wenige Treffer).
 */
export async function findComparableProducts(
  identified: VisionAnalysis,
): Promise<ProductSearchResult> {
  return dummyProductSearch(identified);
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
