// Browser helper: turn a picked image File into the base64 + media type the
// AI actions expect. Rejects formats the Anthropic vision API doesn't take.

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageData {
  base64: string;
  mediaType: ImageMediaType;
}

export function readImageFile(file: File): Promise<ImageData> {
  const mediaType = normalizeType(file.type);
  if (!mediaType) {
    return Promise.reject(
      new Error("Use a PNG, JPEG, or WebP image."),
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      // Strip the "data:image/...;base64," prefix.
      const base64 = result.slice(result.indexOf(",") + 1);
      resolve({ base64, mediaType });
    };
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.readAsDataURL(file);
  });
}

function normalizeType(type: string): ImageMediaType | null {
  if (type === "image/jpg") return "image/jpeg";
  if (type === "image/png" || type === "image/jpeg" || type === "image/webp") {
    return type;
  }
  return null;
}

// Anthropic's vision API downsizes anything past ~1568px on the long edge, so
// shipping a full-res phone photo just wastes upload time and tokens.
const MAX_DIM = 1568;
// Only bother re-encoding when the file is genuinely large.
const DOWNSCALE_ABOVE_BYTES = 1_000_000;

// Browser-only: shrink a large image before upload. Returns the original file
// untouched when it's already small, can't be decoded, or we're not in a
// browser (so it's a no-op under test and in any server context).
export async function downscaleImage(
  file: File,
  maxDim = MAX_DIM,
): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }
  if (file.size <= DOWNSCALE_ABOVE_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close?.();
      return file;
    }
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// What the AI upload UIs should call: downscale a big image, then read it into
// the base64 + media type the server actions expect.
export async function readImageForUpload(file: File): Promise<ImageData> {
  return readImageFile(await downscaleImage(file));
}
