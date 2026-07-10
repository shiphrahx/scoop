// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readImageFile } from "@/lib/image";

// jsdom provides File and FileReader, so we can exercise the real reader.
function file(bytes: string, type: string): File {
  return new File([bytes], "pic", { type });
}

describe("readImageFile", () => {
  it("reads a PNG into base64 + media type", async () => {
    const data = await readImageFile(file("hello", "image/png"));
    expect(data.mediaType).toBe("image/png");
    // "hello" base64-encoded
    expect(data.base64).toBe("aGVsbG8=");
  });

  it("normalises image/jpg to image/jpeg", async () => {
    const data = await readImageFile(file("x", "image/jpg"));
    expect(data.mediaType).toBe("image/jpeg");
  });

  it("accepts webp", async () => {
    const data = await readImageFile(file("x", "image/webp"));
    expect(data.mediaType).toBe("image/webp");
  });

  it("rejects an unsupported format", async () => {
    await expect(readImageFile(file("x", "image/gif"))).rejects.toThrow(
      /PNG, JPEG, or WebP/,
    );
  });

  it("rejects a file with no type", async () => {
    await expect(readImageFile(file("x", ""))).rejects.toThrow();
  });
});
