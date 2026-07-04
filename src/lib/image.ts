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
