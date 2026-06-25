import { del, put } from "@vercel/blob";
import type { AlternativeProduct, AnalysisResult } from "../analysis-types";
import type { UploadedImage } from "../upload";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
// 1 Treffer wird als "Original" verwendet, die übrigen 3 müssen als
// eigenständige (nicht mit dem Original oder untereinander identische)
// Alternativen taugen - siehe buildResultFromMatches.
const MIN_PRICED_MATCHES = 4;

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
 * Aufrufer (route.ts) antwortet dann mit { status: "no_match" } statt
 * irgendein Ergebnis zu erfinden.
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
    const matches = data.visual_matches ?? [];
    const result = buildResultFromMatches(matches);

    if (result) {
      console.log(
        `[searchWithGoogleLens] Live-Treffer: "${result.originalProduct.name}" (${matches.length} visual_matches, davon mit Preis verwertet).`,
      );
    } else {
      console.log(
        `[searchWithGoogleLens] Zu wenige preisgelistete Treffer (${matches.length} visual_matches insgesamt) - kein echtes Ergebnis.`,
      );
    }

    return result;
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

  // Der erste Treffer ist Google Lens' relevantester visueller Match und
  // wird als "Original" gezeigt. Alternativen kommen bewusst aus dem Rest,
  // sonst kann "Original" und "Beste Alternative" derselbe Treffer sein.
  const [original, ...rest] = priced;
  const sortedByPrice = [...rest].sort(
    (a, b) => a.price.extracted_value - b.price.extracted_value,
  );

  const cheapest = sortedByPrice[0];
  const premium = sortedByPrice[sortedByPrice.length - 1];
  const best = sortedByPrice[Math.floor(sortedByPrice.length / 2)];
  const prices = priced.map((match) => match.price.extracted_value);

  const toAlternative = (
    match: LensVisualMatch & { title: string; price: { extracted_value: number } },
    role: AlternativeProduct["role"],
  ): AlternativeProduct => ({
    role,
    name: cleanTitle(match.title),
    store: match.source ?? "Unbekannter Shop",
    price: match.price.extracted_value,
    savingsPercent: Math.max(
      0,
      Math.round((1 - match.price.extracted_value / original.price.extracted_value) * 100),
    ),
  });

  // Marke/Kategorie werden auf dem vollen Originaltitel erkannt, nicht erst
  // auf dem gekürzten Anzeigenamen - sonst kann cleanTitle die Marke
  // versehentlich mit abschneiden, falls sie hinter dem Trennzeichen steht.
  const brand = guessBrand(original.title);
  const category = guessCategory(original.title);
  const originalName = cleanTitle(original.title);

  return {
    originalProduct: {
      name: originalName,
      brand,
      store: original.source ?? "Unbekannter Shop",
      price: original.price.extracted_value,
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

/**
 * Google-Lens-Titel sind gescrapte Seiten-Titel und können angehängte
 * Shop-/Site-Namen oder Größen-/Farbangaben enthalten. Ohne echte
 * Beispieldaten lässt sich kein verlässliches Trennzeichen-Muster
 * annehmen (riskiert, die Marke mit abzuschneiden) - daher bewusst nur
 * Whitespace-Trimming. Siehe "Bekannte Grenzen" in der Dokumentation.
 */
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

/**
 * Sucht einen bekannten Markennamen irgendwo im Titel (nicht nur am Anfang -
 * gescrapte Titel beginnen oft mit Farbe/Schnitt statt der Marke). Ohne
 * Treffer bleibt die ursprüngliche Heuristik (erstes Wort) als Fallback.
 */
function guessBrand(title: string): string {
  const lower = title.toLowerCase();
  const match = KNOWN_BRANDS.find((brand) => lower.includes(brand.toLowerCase()));
  if (match) return match;
  return title.trim().split(/\s+/)[0] || "Unbekannt";
}

/**
 * Leichte Keyword-Heuristik für die Kategorie, da Google Lens selbst keine
 * Kategorie liefert - nur der Titel steht zur Verfügung. Bewusst kein LLM
 * (Phase 1 = SerpAPI pur), daher kein Anspruch auf Vollständigkeit.
 */
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
