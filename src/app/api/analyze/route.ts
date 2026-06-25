import { NextResponse } from "next/server";
import { parseUploadedImage, UploadError } from "@/lib/upload";
import { analyzeProductImage } from "@/lib/services/vision-service";
import {
  findComparableProducts,
  searchWithGoogleLens,
} from "@/lib/services/product-search-service";
import type { AnalysisResult } from "@/lib/analysis-types";

/**
 * POST /api/analyze
 *
 * Erwartet multipart/form-data mit einem Feld "image".
 *
 * Pipeline (Phase 6 - SerpAPI Google Lens als einziger echter Anbieter):
 * 1. Upload validieren.
 * 2. Ist SERPAPI_KEY gesetzt -> echte Bildsuche über Google Lens versuchen.
 *    Liefert sie ein brauchbares Ergebnis, wird es direkt zurückgegeben.
 * 3. Sonst (kein Key, Aufruf fehlgeschlagen oder zu wenige Treffer) ->
 *    saubrer Fallback auf den bestehenden Dummy-Katalog (Vision-Service +
 *    Produktsuche-Service), identisch zum bisherigen Phase-5-Verhalten.
 *
 * Es ist bewusst kein Vision-LLM (OpenAI/Gemini/Claude) im Spiel - SerpAPI
 * Google Lens identifiziert und vergleicht Preise in einem Schritt.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request muss multipart/form-data sein." },
      { status: 400 },
    );
  }

  let image;
  try {
    image = await parseUploadedImage(formData);
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  try {
    const liveResult = await searchWithGoogleLens(image);
    if (liveResult) {
      return NextResponse.json(liveResult);
    }

    console.log(
      "[/api/analyze] Kein Live-Ergebnis von SerpAPI - verwende Dummy-Katalog-Fallback.",
    );

    const identified = await analyzeProductImage(image);
    const search = await findComparableProducts(identified);

    const result: AnalysisResult = {
      originalProduct: {
        name: identified.name,
        brand: identified.brand,
        store: search.original.store,
        price: search.original.price,
      },
      brand: identified.brand,
      category: identified.category,
      confidence: identified.confidence,
      priceRange: search.priceRange,
      alternatives: search.alternatives,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler bei der Analyse.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
