import { describe, expect, it } from "vitest";
import { createGate, readFrame, type FrameReading } from "@/lib/barcode/sharpness";

const W = 32;
const H = 16;

// Build the RGBA buffer a canvas would hand back, from a grey level per pixel.
function frame(level: (x: number, y: number) => number) {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = level(x, y);
      pixels[i] = v;
      pixels[i + 1] = v;
      pixels[i + 2] = v;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

// Hard black and white stripes: a barcode, near enough.
const bars = (x: number) => (x % 4 < 2 ? 0 : 255);
// The same bars smeared across four pixels, which is what an out of focus
// camera hands back.
const smearedBars = (x: number) => {
  let total = 0;
  for (let d = -2; d <= 2; d++) total += bars(Math.max(0, Math.min(W - 1, x + d)));
  return total / 5;
};

describe("readFrame", () => {
  it("scores a flat frame as having no detail at all", () => {
    expect(readFrame(frame(() => 128), W, H).sharpness).toBeCloseTo(0, 6);
  });

  it("scores sharp bars far above the same bars out of focus", () => {
    const sharp = readFrame(frame((x) => bars(x)), W, H).sharpness;
    const blurred = readFrame(frame((x) => smearedBars(x)), W, H).sharpness;

    expect(sharp).toBeGreaterThan(0);
    // The whole gate rests on this gap being large, not marginal.
    expect(blurred).toBeLessThan(sharp / 10);
  });

  it("reads back the brightness of the frame", () => {
    expect(readFrame(frame(() => 0), W, H).brightness).toBeCloseTo(0, 4);
    expect(readFrame(frame(() => 255), W, H).brightness).toBeCloseTo(255, 4);
    expect(readFrame(frame(() => 100), W, H).brightness).toBeCloseTo(100, 4);
  });

  // The Laplacian needs a neighbour on each side, so a crop this small has no
  // interior to measure and must not divide by zero.
  it("returns zeros for a crop too small to have an interior", () => {
    expect(readFrame(new Uint8ClampedArray(2 * 2 * 4), 2, 2)).toEqual({
      sharpness: 0,
      brightness: 0,
    });
  });
});

const reading = (sharpness: number): FrameReading => ({ sharpness, brightness: 128 });

describe("createGate", () => {
  it("decodes the very first frame rather than waiting to calibrate", () => {
    expect(createGate().accept(reading(42), 0)).toBe(true);
  });

  it("skips a frame well below the sharpest one seen", () => {
    const gate = createGate();

    expect(gate.accept(reading(100), 0)).toBe(true);
    expect(gate.accept(reading(20), 100)).toBe(false);
  });

  it("decodes again as soon as the picture comes back into focus", () => {
    const gate = createGate();

    gate.accept(reading(100), 0);
    expect(gate.accept(reading(20), 100)).toBe(false);
    expect(gate.accept(reading(98), 200)).toBe(true);
  });

  // The gate must not be able to turn into the bug it is fixing. If it has
  // misread this camera entirely, it still has to let a decode through.
  it("gives up and decodes anyway once it has skipped for long enough", () => {
    const gate = createGate({ maxSkipMs: 700 });

    gate.accept(reading(1000), 0);
    expect(gate.accept(reading(1), 300)).toBe(false);
    expect(gate.accept(reading(1), 699)).toBe(false);
    expect(gate.accept(reading(1), 700)).toBe(true);
  });

  // Walking from a glossy label to a matt cardboard box drops every score. The
  // old peak has to fade or the box would never be scanned.
  it("forgets a peak it has not matched in a while", () => {
    const gate = createGate({ maxSkipMs: Number.MAX_SAFE_INTEGER, halfLifeMs: 1500 });

    gate.accept(reading(1000), 0);
    // Still in the shadow of the peak.
    expect(gate.accept(reading(100), 600)).toBe(false);
    // Several half-lives later the peak has decayed under this frame.
    expect(gate.accept(reading(100), 6000)).toBe(true);
  });

  it("holds the peak across the blurred frames either side of a focus hunt", () => {
    const gate = createGate({ maxSkipMs: Number.MAX_SAFE_INTEGER, halfLifeMs: 1500 });

    gate.accept(reading(1000), 0);
    // A tenth of a second of hunting at 30fps, all of it soft.
    for (let t = 33; t <= 132; t += 33) {
      expect(gate.accept(reading(50), t)).toBe(false);
    }
  });
});
