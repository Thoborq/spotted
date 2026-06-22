const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export class UploadError extends Error {}

export type UploadedImage = {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Liest und validiert ein hochgeladenes Bild aus einem multipart/form-data
 * Request-Body. Erwartet das Feld "image". Wirft UploadError bei fehlendem,
 * zu großem oder nicht unterstütztem Bild.
 */
export async function parseUploadedImage(
  formData: FormData,
): Promise<UploadedImage> {
  const file = formData.get("image");

  if (!(file instanceof File)) {
    throw new UploadError("Kein Bild im Feld \"image\" gefunden.");
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new UploadError(
      `Nicht unterstütztes Bildformat: ${file.type || "unbekannt"}. Erlaubt: ${ALLOWED_MIME_TYPES.join(", ")}.`,
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError(
      `Bild zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Limit: ${MAX_SIZE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: file.type,
    sizeBytes: file.size,
  };
}
