import { NextResponse } from "next/server";
import { parseUploadedImage, UploadError } from "@/lib/upload";
import { analyzeProductImage } from "@/lib/services/vision-service";
import { findComparableProducts } from "@/lib/services/product-search-service";
import type { AnalysisResult } from "@/lib/analysis-types";

/**
 * POST /api/analyze
 *
 * Erwartet multipart/form-data mit einem Feld "image".
 * Pipeline: Upload validieren -> Vision-Service (Produkt/Marke/Kategorie
 * erkennen) -> Produktsuche-Service (Preis/Alternativen finden) ->
 * AnalysisResult.
 *
 * Ohne konfigurierte API-Keys (Standardzustand, siehe .env.example)
 * durchlaufen beide Services automatisch ihren Dummy-Fallback - die Route
 * verursacht dann keine echten Kosten und keine externen Aufrufe.
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
