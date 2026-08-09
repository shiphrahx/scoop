import { describe, expect, it } from "vitest";
import { coverLayout, normalizedPoint, sourceRect } from "@/lib/barcode/roi";

// A 1080p landscape stream shown full-bleed on a portrait phone, which is the
// case that went wrong: object-cover throws most of the frame's width off the
// side of the screen.
const FRAME = { width: 1920, height: 1080 };
const PHONE = { width: 390, height: 844 };

// The aiming guide, centred in that viewport.
const GUIDE = { x: 21, y: 322, width: 348, height: 200 };

describe("coverLayout", () => {
  it("scales to fill the short axis and hangs the rest off both sides", () => {
    const { scale, left, top } = coverLayout(FRAME, PHONE);

    // Height is the binding axis: 844 / 1080.
    expect(scale).toBeCloseTo(844 / 1080, 6);
    expect(top).toBeCloseTo(0, 6);
    // The drawn width is far wider than the screen, centred, so it starts left
    // of zero. This overhang is what the decoder used to spend its time on.
    expect(left).toBeLessThan(0);
    expect(FRAME.width * scale).toBeGreaterThan(PHONE.width * 3);
  });

  it("leaves a frame that already matches the box untouched", () => {
    const { scale, left, top } = coverLayout({ width: 640, height: 480 }, { width: 320, height: 240 });

    expect(scale).toBeCloseTo(0.5, 6);
    expect(left).toBeCloseTo(0, 6);
    expect(top).toBeCloseTo(0, 6);
  });
});

describe("sourceRect", () => {
  it("puts a centred guide over the centre of the frame", () => {
    const rect = sourceRect(FRAME, PHONE, GUIDE)!;

    // Within a pixel: the crop is rounded to whole pixels for the canvas.
    expect(Math.abs(rect.x + rect.width / 2 - FRAME.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.y + rect.height / 2 - FRAME.height / 2)).toBeLessThanOrEqual(1);
  });

  it("returns a genuine crop, not the whole frame", () => {
    const rect = sourceRect(FRAME, PHONE, GUIDE)!;

    // The point of the exercise: the decode reads a fraction of the pixels it
    // used to, and every one of them is a pixel the user could see.
    expect(rect.width * rect.height).toBeLessThan(FRAME.width * FRAME.height * 0.2);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.x + rect.width).toBeLessThan(FRAME.width);
  });

  it("keeps the guide's shape", () => {
    const rect = sourceRect(FRAME, PHONE, GUIDE)!;

    expect(rect.width / rect.height).toBeCloseTo(GUIDE.width / GUIDE.height, 1);
  });

  it("grows the crop by the padding fraction on every side", () => {
    const tight = sourceRect(FRAME, PHONE, GUIDE)!;
    const padded = sourceRect(FRAME, PHONE, GUIDE, 0.25)!;

    expect(Math.abs(padded.width - tight.width * 1.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(padded.height - tight.height * 1.5)).toBeLessThanOrEqual(1);
    // Still centred on the same spot.
    const drift = padded.x + padded.width / 2 - (tight.x + tight.width / 2);
    expect(Math.abs(drift)).toBeLessThanOrEqual(1);
  });

  it("stays inside the frame when the padding runs off the edge", () => {
    const rect = sourceRect(FRAME, PHONE, GUIDE, 5)!;

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(FRAME.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FRAME.height);
  });

  // videoWidth is 0 until the first frame lands, and an unmounted or hidden
  // element measures 0. Cropping to either would size a canvas at nothing.
  it("gives nothing back before the video and the layout have sizes", () => {
    expect(sourceRect({ width: 0, height: 0 }, PHONE, GUIDE)).toBeNull();
    expect(sourceRect(FRAME, { width: 0, height: 0 }, GUIDE)).toBeNull();
  });

  it("gives nothing back for a guide too small to hold a pixel", () => {
    expect(sourceRect(FRAME, PHONE, { x: 10, y: 10, width: 0.1, height: 0.1 })).toBeNull();
  });
});

describe("normalizedPoint", () => {
  it("maps the middle of the screen to the middle of the frame", () => {
    const point = normalizedPoint(FRAME, PHONE, { x: 195, y: 422 })!;

    expect(point.x).toBeCloseTo(0.5, 6);
    expect(point.y).toBeCloseTo(0.5, 6);
  });

  // The left edge of the screen is a long way into the frame, so a tap there
  // must not be reported to the camera as the frame's own left edge.
  it("accounts for the part of the frame hidden off screen", () => {
    const point = normalizedPoint(FRAME, PHONE, { x: 0, y: 422 })!;

    expect(point.x).toBeGreaterThan(0.3);
    expect(point.x).toBeLessThan(0.5);
  });

  it("clamps a tap outside the frame rather than refusing it", () => {
    const left = normalizedPoint(FRAME, PHONE, { x: -4000, y: -4000 })!;
    const right = normalizedPoint(FRAME, PHONE, { x: 4000, y: 4000 })!;

    expect(left).toEqual({ x: 0, y: 0 });
    expect(right).toEqual({ x: 1, y: 1 });
  });

  it("gives nothing back before the video has a size", () => {
    expect(normalizedPoint({ width: 0, height: 0 }, PHONE, { x: 1, y: 1 })).toBeNull();
  });
});
