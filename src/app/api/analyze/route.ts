import { NextResponse } from "next/server";
import { parseUploadedImage, UploadError } from "@/lib/upload";
import {
  isProductSearchConfigured,
  searchWithGoogleLens,
} from "@/lib/services/product-search-service";
import type { AnalyzeResponse } from "@/lib/analysis-types";

/**
 * POST /api/analyze
 *
 * Erwartet multipart/form-data mit einem Feld "image".
 *
 * Ausschließlich echte Produkterkennung über SerpAPI Google Lens - kein
 * Dummy-/Demo-Ergebnis wird je als echter Treffer zurückgegeben:
 *
 * 1. Upload validieren.
 * 2. Kein SERPAPI_KEY gesetzt -> { status: "not_configured" }, sofort,
 *    ohne Foto hochzuladen.
 * 3. SERPAPI_KEY gesetzt -> echte Bildsuche über Google Lens.
 *    - Brauchbarer Treffer -> { status: "ok", result }.
 *    - Kein brauchbarer Treffer oder Aufruf fehlgeschlagen ->
 *      { status: "no_match" }.
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

  if (!isProductSearchConfigured()) {
    console.log("[/api/analyze] Kein SERPAPI_KEY gesetzt - echte Suche nicht aktiviert.");
    return NextResponse.json({ status: "not_configured" } satisfies AnalyzeResponse);
  }

  try {
    const liveResult = await searchWithGoogleLens(image);
    if (liveResult) {
      return NextResponse.json({ status: "ok", result: liveResult } satisfies AnalyzeResponse);
    }

    return NextResponse.json({ status: "no_match" } satisfies AnalyzeResponse);
  } catch (error) {
    console.error("[/api/analyze] SerpAPI-Aufruf fehlgeschlagen:", error);
    return NextResponse.json({ status: "no_match" } satisfies AnalyzeResponse);
  }
}
