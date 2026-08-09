import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// zxing is the fallback, so every test needs it stubbed, including the ones
// that assert it never gets used.
const readerBuilt = vi.fn();
const decodeFromCanvas = vi.fn();

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    hints: Map<number, unknown>;
    constructor(hints: Map<number, unknown>) {
      this.hints = hints;
      readerBuilt(hints);
    }
    decodeFromCanvas(canvas: unknown) {
      return decodeFromCanvas(this.hints, canvas);
    }
  },
}));

vi.mock("@zxing/library", () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4, CODE_128: 5, ITF: 6, QR_CODE: 99 },
  DecodeHintType: { POSSIBLE_FORMATS: 2, TRY_HARDER: 3 },
}));

const { createDecoder } = await import("@/lib/barcode/decoder");

const TRY_HARDER = 3;
const POSSIBLE_FORMATS = 2;
const CANVAS = {} as HTMLCanvasElement;
const FAST = { hard: false };
const HARD = { hard: true };

// The formats a Chrome with the scanning module installed reports.
const ANDROID_FORMATS = [
  "aztec", "code_128", "code_39", "data_matrix", "ean_13", "ean_8",
  "itf", "pdf417", "qr_code", "upc_a", "upc_e",
];

const detect = vi.fn();
const detectorBuilt = vi.fn();

function installBarcodeDetector({
  formats = ANDROID_FORMATS,
  supportedThrows = false,
}: { formats?: string[]; supportedThrows?: boolean } = {}) {
  class FakeBarcodeDetector {
    constructor(options?: { formats?: string[] }) {
      detectorBuilt(options);
    }
    detect(source: CanvasImageSource) {
      return detect(source);
    }
    static getSupportedFormats() {
      if (supportedThrows) return Promise.reject(new Error("no module"));
      return Promise.resolve(formats);
    }
  }
  (globalThis as Record<string, unknown>).BarcodeDetector = FakeBarcodeDetector;
}

beforeEach(() => {
  readerBuilt.mockReset();
  decodeFromCanvas.mockReset();
  detect.mockReset();
  detectorBuilt.mockReset();
  // Nothing readable unless a test says otherwise.
  decodeFromCanvas.mockImplementation(() => {
    throw new Error("NotFoundException");
  });
  detect.mockResolvedValue([]);
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).BarcodeDetector;
});

describe("createDecoder, on a phone with a built in scanner", () => {
  beforeEach(installBarcodeDetector);

  it("uses the phone's decoder", async () => {
    const decoder = await createDecoder();
    expect(decoder.kind).toBe("native");
  });

  it("reads the code the phone found", async () => {
    detect.mockResolvedValue([{ rawValue: "5000112637922" }]);

    const decoder = await createDecoder();
    expect(await decoder.decode(CANVAS, FAST)).toBe("5000112637922");
  });

  it("gives nothing back for a frame with no barcode in it", async () => {
    const decoder = await createDecoder();
    expect(await decoder.decode(CANVAS, FAST)).toBeNull();
  });

  // A food packet only ever carries a retail 1D symbology. Every other format
  // is decode budget spent on something that cannot be on the pack.
  it("asks only for the barcodes food packaging carries", async () => {
    await createDecoder();

    const { formats } = detectorBuilt.mock.calls[0][0] as { formats: string[] };
    expect(formats).toContain("ean_13");
    expect(formats).toContain("upc_a");
    expect(formats).not.toContain("qr_code");
    expect(formats).not.toContain("pdf417");
  });

  // Half a megabyte of decoder that is never going to run.
  it("does not load zxing at all", async () => {
    const decoder = await createDecoder();
    await decoder.decode(CANVAS, FAST);

    expect(readerBuilt).not.toHaveBeenCalled();
  });
});

describe("createDecoder, falling back to zxing", () => {
  it("falls back when the browser has no built in scanner", async () => {
    const decoder = await createDecoder();
    expect(decoder.kind).toBe("zxing");
  });

  // Chrome can expose the constructor while the Play Services module behind it
  // is missing, and then it reports no formats at all.
  it("falls back when the phone's scanner reports no usable formats", async () => {
    installBarcodeDetector({ formats: [] });

    expect((await createDecoder()).kind).toBe("zxing");
  });

  it("falls back when asking what the phone supports throws", async () => {
    installBarcodeDetector({ supportedThrows: true });

    expect((await createDecoder()).kind).toBe("zxing");
  });

  it("falls back when the phone offers only formats food never uses", async () => {
    installBarcodeDetector({ formats: ["qr_code", "aztec"] });

    expect((await createDecoder()).kind).toBe("zxing");
  });

  // The failure that only shows up on the first real frame.
  it("switches over when the phone's decoder keeps throwing", async () => {
    installBarcodeDetector();
    detect.mockRejectedValue(new Error("module not available"));
    decodeFromCanvas.mockReturnValue({ getText: () => "8720182355560" });

    const decoder = await createDecoder();
    for (let i = 0; i < 3; i++) {
      expect(await decoder.decode(CANVAS, FAST)).toBeNull();
    }

    expect(await decoder.decode(CANVAS, FAST)).toBe("8720182355560");
    expect(decoder.kind).toBe("zxing");
  });

  it("rides out a single failure rather than abandoning the better decoder", async () => {
    installBarcodeDetector();
    detect.mockRejectedValueOnce(new Error("busy"));

    const decoder = await createDecoder();
    expect(await decoder.decode(CANVAS, FAST)).toBeNull();

    detect.mockResolvedValue([{ rawValue: "5000112637922" }]);
    expect(await decoder.decode(CANVAS, FAST)).toBe("5000112637922");
    expect(decoder.kind).toBe("native");
  });
});

describe("the zxing fallback", () => {
  it("reads the code out of the frame", async () => {
    decodeFromCanvas.mockReturnValue({ getText: () => "5000112637922" });

    const decoder = await createDecoder();
    expect(await decoder.decode(CANVAS, FAST)).toBe("5000112637922");
  });

  it("treats a frame it cannot read as no code, not as an error", async () => {
    const decoder = await createDecoder();
    await expect(decoder.decode(CANVAS, FAST)).resolves.toBeNull();
  });

  // TRY_HARDER scans every row of the frame and then rotates it and does it
  // again, which on a 1080p frame is seconds. Paying that on every frame is
  // what left the scanner reading roughly one frame a second.
  it("keeps TRY_HARDER off the frame by frame pass", async () => {
    const decoder = await createDecoder();
    await decoder.decode(CANVAS, FAST);

    const hints = decodeFromCanvas.mock.calls[0][0] as Map<number, unknown>;
    expect(hints.get(TRY_HARDER)).toBeUndefined();
    expect(hints.get(POSSIBLE_FORMATS)).toBeTruthy();
  });

  it("spends the larger budget once the caller asks it to", async () => {
    const decoder = await createDecoder();
    await decoder.decode(CANVAS, HARD);

    const hints = decodeFromCanvas.mock.calls[0][0] as Map<number, unknown>;
    expect(hints.get(TRY_HARDER)).toBe(true);
  });

  it("looks only for the barcodes food packaging carries", async () => {
    const decoder = await createDecoder();
    await decoder.decode(CANVAS, FAST);

    const hints = decodeFromCanvas.mock.calls[0][0] as Map<number, unknown>;
    const formats = hints.get(POSSIBLE_FORMATS) as number[];
    expect(formats).toContain(1); // EAN_13
    expect(formats).toContain(3); // UPC_A
    expect(formats).not.toContain(99); // QR_CODE
  });

  // Both readers are built once, when the decoder is created, not per frame.
  it("builds its readers once, not on every frame", async () => {
    const decoder = await createDecoder();
    const built = readerBuilt.mock.calls.length;

    await decoder.decode(CANVAS, FAST);
    await decoder.decode(CANVAS, HARD);
    await decoder.decode(CANVAS, FAST);

    expect(readerBuilt).toHaveBeenCalledTimes(built);
  });
});
