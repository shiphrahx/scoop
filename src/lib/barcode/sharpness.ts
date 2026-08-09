// Is this frame worth decoding?
//
// A hand-held phone is sharp for maybe a fifth of a second at a time, between
// autofocus hunts and the wobble of an arm held out. Decoding is expensive, so
// spending it on a frame that was never in focus is the whole budget wasted:
// by the time the decode returns, the sharp moment has passed unread.
//
// The measure is the variance of the Laplacian, the standard cheap focus score.
// A sharp edge has a large second derivative, a blurred one does not, so an
// image with real detail scores high and a smear scores near zero. It is run on
// a thumbnail, not the full crop, which is enough to tell focus from blur and
// costs almost nothing.

export interface FrameReading {
  // Variance of the Laplacian. Higher is sharper. Not comparable between
  // cameras, only between frames from the same one.
  sharpness: number;
  // Mean brightness, 0 to 255. Free from the same pass, and it is what decides
  // whether the torch is worth turning on.
  brightness: number;
}

// RGBA pixels straight off a canvas.
export function readFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): FrameReading {
  if (width < 3 || height < 3) return { sharpness: 0, brightness: 0 };

  const gray = new Float32Array(width * height);
  let total = 0;
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    // Rec. 601 luma, the same weighting the decoders use.
    const value = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    gray[j] = value;
    total += value;
  }

  // Four neighbour Laplacian, skipping the border where it has no neighbours.
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const laplacian =
        gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  return {
    // Clamped because the shortcut form of the variance can land a hair below
    // zero on a perfectly flat frame.
    sharpness: Math.max(0, sumSquares / count - mean * mean),
    brightness: total / gray.length,
  };
}

export interface Gate {
  // True when this frame is worth decoding. Call once per frame, in order.
  accept(reading: FrameReading, now: number): boolean;
}

export interface GateOptions {
  // Fraction of the best frame seen so far that a frame must reach. Relative,
  // because an absolute threshold cannot hold across cameras, lighting and
  // packaging: a matt cardboard box in a dim kitchen scores an order of
  // magnitude below a glossy label under a spotlight, and both need scanning.
  fraction?: number;
  // Never skip for longer than this. A gate that is wrong about a camera would
  // be a scanner that never fires, which is the bug we are fixing, so it always
  // yields eventually.
  maxSkipMs?: number;
  // How fast the high water mark forgets. Long enough to hold the peak of an
  // autofocus hunt across the blurred frames either side of it, short enough
  // that moving from a glossy label to a matt box does not lock the gate for
  // the rest of the session. Measured in time, not frames, because the frame
  // rate is the camera's choice and varies between 30 and 60.
  halfLifeMs?: number;
}

export function createGate({
  fraction = 0.6,
  maxSkipMs = 700,
  halfLifeMs = 1500,
}: GateOptions = {}): Gate {
  let best = 0;
  let lastAccepted: number | null = null;
  let lastSeen: number | null = null;

  return {
    accept(reading, now) {
      if (lastAccepted === null) lastAccepted = now;
      const elapsed = lastSeen === null ? 0 : Math.max(0, now - lastSeen);
      lastSeen = now;

      best = Math.max(reading.sharpness, best * 0.5 ** (elapsed / halfLifeMs));

      const sharp = reading.sharpness >= best * fraction;
      const waited = now - lastAccepted >= maxSkipMs;
      if (!sharp && !waited) return false;

      lastAccepted = now;
      return true;
    },
  };
}
