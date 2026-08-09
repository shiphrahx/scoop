import { describe, expect, it, vi } from "vitest";
import { startScanner, type Capture, type Shot } from "@/lib/barcode/scan";
import type { Decoder } from "@/lib/barcode/decoder";
import type { Gate } from "@/lib/barcode/sharpness";

const VIDEO = { videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement;
const GUIDE = { x: 776, y: 438, width: 369, height: 205 };
const CANVAS = {} as HTMLCanvasElement;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function shot(sharpness = 100): Shot {
  return { canvas: CANVAS, reading: { sharpness, brightness: 128 } };
}

const alwaysGate: Gate = { accept: () => true };
const neverGate: Gate = { accept: () => false };

function harness({
  decode = vi.fn().mockResolvedValue(null),
  capture = vi.fn().mockReturnValue(shot()) as unknown as Capture,
  aim = () => GUIDE,
  gate = alwaysGate,
  decoderReady = true,
  ...rest
}: Partial<Parameters<typeof startScanner>[0]> & {
  decode?: ReturnType<typeof vi.fn>;
  decoderReady?: boolean;
} = {}) {
  const queue: (() => void)[] = [];
  const schedule = vi.fn((run: () => void) => {
    queue.push(run);
    return () => {
      const at = queue.indexOf(run);
      if (at >= 0) queue.splice(at, 1);
    };
  });

  let clock = 0;
  const onDetected = vi.fn();
  const onReading = vi.fn();
  const decoder: Decoder = { kind: "zxing", decode };

  const scanner = startScanner({
    video: VIDEO,
    aim,
    onDetected,
    onReading,
    gate,
    capture,
    schedule,
    now: () => clock,
    decoder: () => (decoderReady ? Promise.resolve(decoder) : new Promise<Decoder>(() => {})),
    ...rest,
  });

  return {
    scanner,
    schedule,
    queue,
    decode,
    capture: capture as unknown as ReturnType<typeof vi.fn>,
    onDetected,
    onReading,
    advance: (ms: number) => {
      clock += ms;
    },
    // Run the frame the loop is waiting on, then let the decode settle.
    async frame() {
      queue.shift()?.();
      await settle();
    },
    async ready() {
      await settle();
    },
  };
}

describe("startScanner", () => {
  it("reports the first code it reads", async () => {
    const h = harness({ decode: vi.fn().mockResolvedValue("5000112637922") });
    await h.ready();
    await h.frame();

    expect(h.onDetected).toHaveBeenCalledWith("5000112637922");
  });

  it("stops looking once it has one", async () => {
    const h = harness({ decode: vi.fn().mockResolvedValue("5000112637922") });
    await h.ready();
    await h.frame();

    expect(h.queue).toHaveLength(0);
    await h.frame();
    expect(h.decode).toHaveBeenCalledTimes(1);
    expect(h.onDetected).toHaveBeenCalledTimes(1);
  });

  it("keeps going while the frames come back empty", async () => {
    const h = harness();
    await h.ready();

    await h.frame();
    await h.frame();
    await h.frame();

    expect(h.decode).toHaveBeenCalledTimes(3);
    expect(h.onDetected).not.toHaveBeenCalled();
  });

  // The point of the gate: decoding is the expensive part, and a frame that was
  // never in focus cannot repay it.
  it("does not decode a frame the gate turned down", async () => {
    const h = harness({ gate: neverGate });
    await h.ready();

    await h.frame();
    await h.frame();

    expect(h.decode).not.toHaveBeenCalled();
    // Still looking, though.
    expect(h.queue).toHaveLength(1);
  });

  it("still reports the frames it skipped, so the torch can be judged", async () => {
    const h = harness({
      gate: neverGate,
      capture: vi.fn().mockReturnValue(shot(4)) as unknown as Capture,
    });
    await h.ready();
    await h.frame();

    expect(h.onReading).toHaveBeenCalledWith({ sharpness: 4, brightness: 128 });
  });

  // A decode that piles up behind itself is the original bug: attempts queue,
  // each reads a frame older than the last, and the preview stalls.
  it("never starts a second decode while one is in flight", async () => {
    let release: (value: string | null) => void = () => {};
    const decode = vi.fn(
      () => new Promise<string | null>((resolve) => (release = resolve)),
    );
    const h = harness({ decode });
    await h.ready();

    await h.frame();
    expect(h.decode).toHaveBeenCalledTimes(1);
    // Nothing queued: the loop is waiting on the decode, not on the camera.
    expect(h.queue).toHaveLength(0);

    release(null);
    await settle();
    expect(h.queue).toHaveLength(1);
  });

  it("looks at nothing until the decoder is ready", async () => {
    const h = harness({ decoderReady: false });
    await h.ready();

    expect(h.schedule).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
  });

  // videoWidth is zero until the first frame, and the guide cannot be measured
  // before the overlay has laid out.
  it("waits for a guide it can measure without giving up", async () => {
    const h = harness({ aim: () => null });
    await h.ready();
    await h.frame();

    expect(h.capture).not.toHaveBeenCalled();
    expect(h.queue).toHaveLength(1);
  });

  it("keeps looking when a frame cannot be captured", async () => {
    const h = harness({ capture: vi.fn().mockReturnValue(null) as unknown as Capture });
    await h.ready();
    await h.frame();

    expect(h.decode).not.toHaveBeenCalled();
    expect(h.queue).toHaveLength(1);
  });

  it("keeps looking after a decode that throws", async () => {
    const h = harness({ decode: vi.fn().mockRejectedValue(new Error("boom")) });
    await h.ready();
    await h.frame();

    expect(h.queue).toHaveLength(1);
  });

  describe("the thorough decode", () => {
    // Running it on every frame is what made the scanner read about one frame a
    // second and miss nearly every moment the camera was in focus.
    it("stays off while the cheap pass is still in its grace period", async () => {
      const h = harness({ hardAfterMs: 2000, hardEvery: 4 });
      await h.ready();

      for (let i = 0; i < 5; i++) await h.frame();

      for (const call of h.decode.mock.calls) {
        expect(call[1]).toEqual({ hard: false });
      }
    });

    it("takes every fourth frame once the cheap pass has had its go", async () => {
      const h = harness({ hardAfterMs: 2000, hardEvery: 4 });
      await h.ready();
      h.advance(2000);

      for (let i = 0; i < 4; i++) await h.frame();

      const hard = h.decode.mock.calls.map((call) => (call[1] as { hard: boolean }).hard);
      expect(hard).toEqual([false, false, false, true]);
    });
  });

  describe("stop", () => {
    it("cancels the frame it was waiting on", async () => {
      const h = harness();
      await h.ready();
      expect(h.queue).toHaveLength(1);

      h.scanner.stop();
      expect(h.queue).toHaveLength(0);
    });

    it("ignores a code that lands after it was stopped", async () => {
      let release: (value: string | null) => void = () => {};
      const decode = vi.fn(
        () => new Promise<string | null>((resolve) => (release = resolve)),
      );
      const h = harness({ decode });
      await h.ready();
      await h.frame();

      h.scanner.stop();
      release("5000112637922");
      await settle();

      expect(h.onDetected).not.toHaveBeenCalled();
    });
  });
});
