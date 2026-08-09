// Reading a barcode out of a cropped frame.
//
// Two implementations behind one call.
//
// The phone's own decoder first. Chrome on Android has shipped BarcodeDetector
// since 83, backed by the same Play Services scanner the camera app uses. It is
// far more forgiving of a soft, angled or low contrast picture than anything
// that can be written in JavaScript, it runs off the main thread, and it costs
// no download at all. Both owners' Android phone hits this path.
//
// zxing second, for iOS Safari and desktop, imported only when it is going to
// be used: it is around half a megabyte, and there is no reason to ship it to a
// phone that has a better decoder built in.
//
// The zxing path is split into a fast reader and a thorough one on purpose.
// TRY_HARDER makes OneDReader scan every row of the image instead of 25, and
// rotate the whole thing 90 degrees and do it again. On a 1080p frame that is
// roughly forty times the work, which is seconds per attempt on a phone: the
// scanner spent its whole budget inside one call and read maybe one frame a
// second, missing nearly every moment the camera was in focus. So the fast
// reader runs on every frame, and the thorough one only once the fast one has
// been failing for a while and the extra cost is worth paying.

import type { BarcodeFormat, DecodeHintType } from "@zxing/library";

export interface DecodeOptions {
  // Spend the larger budget. The caller turns this on after the cheap pass has
  // been getting nowhere.
  hard: boolean;
}

export interface Decoder {
  decode(canvas: HTMLCanvasElement, options: DecodeOptions): Promise<string | null>;
  // Which implementation is answering. Useful in a bug report, since the two
  // behave differently enough to matter.
  readonly kind: "native" | "zxing";
}

// The only symbologies a food packet carries. Anything wider means the decoder
// spends every attempt looking for QR, Aztec, PDF417 and Data Matrix that
// cannot be on the pack.
const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "itf"];

// How many times the phone's decoder may throw before we stop trusting it and
// move to zxing for the rest of the session. Some Chrome builds expose the
// constructor while the scanning module behind it is missing, and the failure
// only shows up on the first real detect call.
const NATIVE_FAILURES_ALLOWED = 3;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

export async function createDecoder(): Promise<Decoder> {
  const native = await createNativeDecoder();
  return native ? withZxingFallback(native) : createZxingDecoder();
}

async function createNativeDecoder(): Promise<Decoder | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!Detector) return null;

  let supported: string[];
  try {
    supported = await Detector.getSupportedFormats();
  } catch {
    return null;
  }

  const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
  // An empty list is how a browser says the scanning module is not installed,
  // even though the constructor is there.
  if (formats.length === 0) return null;

  let detector: BarcodeDetectorLike;
  try {
    detector = new Detector({ formats });
  } catch {
    return null;
  }

  return {
    kind: "native",
    async decode(canvas) {
      // Deliberately not caught here: the wrapper counts these to decide when
      // to give up on the phone's decoder.
      const found = await detector.detect(canvas);
      return found[0]?.rawValue ?? null;
    },
  };
}

// Keep using the phone's decoder while it works, and switch to zxing for good
// once it has proved it does not.
function withZxingFallback(native: Decoder): Decoder {
  let failures = 0;
  let replacement: Promise<Decoder> | null = null;

  return {
    get kind() {
      return replacement ? ("zxing" as const) : native.kind;
    },
    async decode(canvas, options) {
      if (replacement) return (await replacement).decode(canvas, options);

      try {
        const value = await native.decode(canvas, options);
        failures = 0;
        return value;
      } catch {
        if (++failures >= NATIVE_FAILURES_ALLOWED) replacement = createZxingDecoder();
        return null;
      }
    },
  };
}

async function createZxingDecoder(): Promise<Decoder> {
  const [{ BrowserMultiFormatReader }, library] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);

  const formats: BarcodeFormat[] = [
    library.BarcodeFormat.EAN_13,
    library.BarcodeFormat.EAN_8,
    library.BarcodeFormat.UPC_A,
    library.BarcodeFormat.UPC_E,
    library.BarcodeFormat.CODE_128,
    library.BarcodeFormat.ITF,
  ];

  function hints(tryHarder: boolean): Map<DecodeHintType, unknown> {
    const map = new Map<DecodeHintType, unknown>();
    map.set(library.DecodeHintType.POSSIBLE_FORMATS, formats);
    if (tryHarder) map.set(library.DecodeHintType.TRY_HARDER, true);
    return map;
  }

  const fast = new BrowserMultiFormatReader(hints(false));
  const thorough = new BrowserMultiFormatReader(hints(true));

  return {
    kind: "zxing",
    decode(canvas, options) {
      try {
        return Promise.resolve(
          (options.hard ? thorough : fast).decodeFromCanvas(canvas).getText(),
        );
      } catch {
        // zxing signals "nothing readable in this frame" by throwing, which is
        // the ordinary case, not an error worth surfacing.
        return Promise.resolve(null);
      }
    },
  };
}
