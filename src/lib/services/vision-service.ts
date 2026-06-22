import { catalog } from "../catalog";
import type { UploadedImage } from "../upload";

export type VisionAnalysis = {
  name: string;
  brand: string;
  category: string;
  confidence: number;
};

/**
 * true, sobald mindestens ein Vision-API-Key gesetzt ist. Aktuell sind keine
 * Keys konfiguriert (siehe .env.example) - die Funktion existiert bereits,
 * damit Phase 6 hier nur noch den echten API-Aufruf einsetzen muss.
 */
export function isVisionConfigured(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
  );
}

/**
 * Erkennt Produkt, Marke und Kategorie aus einem Foto.
 *
 * Ohne konfigurierten Vision-API-Key liefert diese Funktion ein
 * deterministisch-zufälliges Ergebnis aus dem bestehenden Dummy-Katalog
 * zurück (identischer Fallback wie der bisherige Client-Flow aus Phase 3).
 *
 * Mit konfiguriertem Key ist hier bewusst noch KEIN echter API-Aufruf
 * implementiert (Phase 5 = Infrastruktur, keine Kosten). Das ist der Punkt,
 * an dem Phase 6 die Anbindung an OpenAI/Gemini/Claude Vision einsetzt.
 */
export async function analyzeProductImage(
  image: UploadedImage,
): Promise<VisionAnalysis> {
  if (!isVisionConfigured()) {
    return dummyVisionAnalysis();
  }

  void image;
  throw new Error(
    "Vision-API-Key gefunden, aber die echte Integration ist noch nicht implementiert (Phase 6).",
  );
}

function dummyVisionAnalysis(): VisionAnalysis {
  const product = catalog[Math.floor(Math.random() * catalog.length)];
  return {
    name: product.name,
    brand: product.brand,
    category: product.category,
    confidence: product.confidence,
  };
}
