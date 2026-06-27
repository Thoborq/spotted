import { NextResponse } from "next/server";
import { put, issueSignedToken, presignUrl } from "@vercel/blob";
import { parseUploadedImage, UploadError } from "@/lib/upload";
import {
  analyzeImageWithGPT,
  buildSearchQueries,
  type VisionDebugReport,
} from "@/lib/services/product-search-service";

/**
 * POST /api/debug/vision
 *
 * Accepts multipart/form-data with an "image" field (same as /api/analyze).
 *
 * Returns the full structured vision analysis + all generated search queries.
 * Does NOT call SerpAPI or perform any product search — pure query-generation
 * diagnostic so query quality can be validated before running real searches.
 *
 * Only works when OPENAI_API_KEY (or OPEN_API_KEY) is set.
 * Does NOT require SERPAPI_KEY.
 *
 * Example curl:
 *   curl -X POST https://your-app.vercel.app/api/debug/vision \
 *     -F "image=@photo.jpg" | jq .
 */
export async function POST(request: Request) {
  const openaiKey =
    process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY;

  if (!openaiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request muss multipart/form-data mit einem 'image'-Feld sein." },
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

  let blobUrl: string | null = null;

  try {
    // Upload image to Vercel Blob and generate a presigned URL for OpenAI
    const ext =
      image.mimeType === "image/png" ? "png"
      : image.mimeType === "image/webp" ? "webp"
      : "jpg";

    const blob = await put(
      `spotted-debug/${Date.now()}.${ext}`,
      image.buffer,
      { access: "private", contentType: image.mimeType },
    );
    blobUrl = blob.url;

    const validUntil = Date.now() + 5 * 60 * 1000;
    const signedToken = await issueSignedToken({
      pathname: blob.pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl: imageUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname: blob.pathname,
      access: "private",
      validUntil,
    });

    const timestamp = new Date().toISOString();
    const analysis = await analyzeImageWithGPT(imageUrl);
    const queries = analysis ? buildSearchQueries(analysis) : [];

    const report: VisionDebugReport = {
      imageUrl,
      timestamp,
      analysis,
      queries,
    };

    // Server-side log — appears in Vercel function logs
    console.log("[/api/debug/vision] ===== DEBUG REPORT =====");
    console.log(`[/api/debug/vision] timestamp: ${timestamp}`);
    if (analysis) {
      console.log(`[/api/debug/vision] productType: ${analysis.productType}`);
      console.log(`[/api/debug/vision] category: ${analysis.category}`);
      console.log(`[/api/debug/vision] brand: "${analysis.brand}"`);
      console.log(`[/api/debug/vision] brandCandidates: [${analysis.brandCandidates.join(", ")}]`);
      console.log(`[/api/debug/vision] primaryColor: "${analysis.primaryColor}"`);
      console.log(`[/api/debug/vision] secondaryColors: [${analysis.secondaryColors.join(", ")}]`);
      console.log(`[/api/debug/vision] material: "${analysis.material}"`);
      console.log(`[/api/debug/vision] pattern: "${analysis.pattern}"`);
      console.log(`[/api/debug/vision] fit: "${analysis.fit}"`);
      console.log(`[/api/debug/vision] sleeveLength: "${analysis.sleeveLength}"`);
      console.log(`[/api/debug/vision] neckline: "${analysis.neckline}"`);
      console.log(`[/api/debug/vision] hood: ${analysis.hood}, zipper: ${analysis.zipper}`);
      console.log(`[/api/debug/vision] pockets: "${analysis.pockets}"`);
      console.log(`[/api/debug/vision] logoPosition: "${analysis.logoPosition}", logoColor: "${analysis.logoColor}"`);
      console.log(`[/api/debug/vision] gender: "${analysis.gender}"`);
      console.log(`[/api/debug/vision] distinctiveFeatures: "${analysis.distinctiveFeatures}"`);
    } else {
      console.log("[/api/debug/vision] analysis: null (GPT returned no product)");
    }
    console.log(`[/api/debug/vision] queries (${queries.length}):`);
    queries.forEach((q, i) =>
      console.log(`  [${i}] [${q.strategy}] "${q.query}"`),
    );
    console.log("[/api/debug/vision] ========================");

    return NextResponse.json(report);
  } finally {
    // Clean up the debug blob — it's only needed for the single GPT call
    if (blobUrl) {
      await import("@vercel/blob")
        .then(({ del }) => del(blobUrl!))
        .catch(() => {/* best-effort */});
    }
  }
}
