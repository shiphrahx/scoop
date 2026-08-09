// The frame loop: crop, judge, decode, repeat.
//
// The old loop was zxing's own, and it had two habits that between them made
// the scanner miss almost every sharp moment the camera produced. It read the
// entire 1080p frame, three quarters of which the preview never showed, and it
// ran the thorough decode on all of it, which takes long enough on a phone that
// the next attempt began well after the focus had drifted again. What the user
// saw was a preview that stuttered and a barcode that never read.
//
// This loop crops to the guide first, scores the crop for focus, and only then
// spends anything on decoding. One decode is in flight at a time, and the next
// frame is not asked for until it finishes, so a slow decode cannot pile up
// behind itself.

import { createDecoder, type Decoder } from "./decoder";
import { createGate, readFrame, type FrameReading, type Gate } from "./sharpness";
import type { Rect } from "./roi";

export interface Shot {
  canvas: HTMLCanvasElement;
  reading: FrameReading;
}

// Draw the crop and measure it. Separated out so the loop can be tested
// without a canvas implementation.
export type Capture = (video: HTMLVideoElement, rect: Rect) => Shot | null;

// Ask for the next frame. Returns a function that cancels the request.
export type Schedule = (run: () => void) => () => void;

export interface ScannerOptions {
  video: HTMLVideoElement;
  // The guide, in the source frame's own coordinates. A function because the
  // layout is not measurable until the video has painted, and it changes when
  // the phone is rotated.
  aim: () => Rect | null;
  onDetected: (barcode: string) => void;
  // Every frame that was looked at, sharp or not. The brightness is what
  // decides whether the torch is worth turning on.
  onReading?: (reading: FrameReading) => void;
  // How long the cheap decode gets on its own before the thorough one starts
  // taking turns.
  hardAfterMs?: number;
  // One frame in this many goes to the thorough decode, once the grace period
  // is up. Running it on every frame is the mistake this loop exists to undo.
  hardEvery?: number;
  decoder?: () => Promise<Decoder>;
  capture?: Capture;
  schedule?: Schedule;
  now?: () => number;
  gate?: Gate;
}

export interface Scanner {
  stop(): void;
}

// The sharpness sample: a band across the middle of the crop, at full
// resolution. Reading a shrunken copy of the whole crop would be cheaper and
// useless, because scaling down blurs exactly the detail the score is looking
// for. This is where the barcode is anyway.
const GAUGE_WIDTH = 256;
const GAUGE_HEIGHT = 64;

export function startScanner(options: ScannerOptions): Scanner {
  const {
    video,
    aim,
    onDetected,
    onReading,
    hardAfterMs = 2000,
    hardEvery = 4,
    decoder: makeDecoder = createDecoder,
    capture = createCanvasCapture(),
    schedule = videoFrames(video),
    now = () => performance.now(),
    gate = createGate(),
  } = options;

  let stopped = false;
  let cancel: (() => void) | null = null;
  let decoder: Decoder | null = null;
  let accepted = 0;
  const startedAt = now();

  void makeDecoder().then((ready) => {
    if (stopped) return;
    decoder = ready;
    queue();
  });

  function queue() {
    if (stopped) return;
    cancel = schedule(tick);
  }

  function tick() {
    cancel = null;
    if (stopped || !decoder) return;

    const rect = aim();
    const shot = rect ? capture(video, rect) : null;
    if (!shot) {
      queue();
      return;
    }

    onReading?.(shot.reading);
    if (!gate.accept(shot.reading, now())) {
      queue();
      return;
    }

    accepted += 1;
    const hard = now() - startedAt >= hardAfterMs && accepted % hardEvery === 0;

    decoder
      .decode(shot.canvas, { hard })
      .then((barcode) => {
        if (stopped) return;
        if (barcode) {
          stopped = true;
          onDetected(barcode);
          return;
        }
        queue();
      })
      .catch(() => queue());
  }

  return {
    stop() {
      stopped = true;
      cancel?.();
      cancel = null;
    },
  };
}

export function createCanvasCapture(): Capture {
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;

  return (video, rect) => {
    if (!video.videoWidth || rect.width < 1 || rect.height < 1) return null;

    if (!canvas) {
      canvas = document.createElement("canvas");
      // The frame is read back on every pass, which is the case this hint
      // exists for: without it the browser keeps the canvas on the GPU and
      // each read stalls waiting for it.
      context = canvas.getContext("2d", { willReadFrequently: true });
    }
    if (!context) return null;

    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    context.drawImage(
      video,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      rect.width,
      rect.height,
    );

    const width = Math.min(GAUGE_WIDTH, rect.width);
    const height = Math.min(GAUGE_HEIGHT, rect.height);
    const band = context.getImageData(
      Math.floor((rect.width - width) / 2),
      Math.floor((rect.height - height) / 2),
      width,
      height,
    );

    return { canvas, reading: readFrame(band.data, width, height) };
  };
}

// One pass per frame the camera actually delivers, rather than a timer that
// does not know when there is anything new to look at.
export function videoFrames(video: HTMLVideoElement): Schedule {
  return (run) => {
    if (typeof video.requestVideoFrameCallback === "function") {
      const id = video.requestVideoFrameCallback(() => run());
      return () => video.cancelVideoFrameCallback?.(id);
    }
    const id = requestAnimationFrame(() => run());
    return () => cancelAnimationFrame(id);
  };
}
