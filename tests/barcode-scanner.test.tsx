// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CameraCapabilities } from "@/lib/barcode/camera";
import type { ScannerOptions } from "@/lib/barcode/scan";

// The frame loop needs a canvas and a real video, neither of which jsdom has.
// It is covered on its own in barcode-scan.test.ts; here we only care that the
// component wires it up and drives the camera correctly.
const startScanner = vi.fn();
const stopScanner = vi.fn();
vi.mock("@/lib/barcode/scan", () => ({
  startScanner: (options: ScannerOptions) => {
    startScanner(options);
    return { stop: stopScanner };
  },
}));

const { default: BarcodeScanner } = await import("@/components/BarcodeScanner");

// The stream the browser hands back, and a record of what it was asked to do.
const applied: Record<string, unknown>[] = [];
const stopTrack = vi.fn();
const getUserMedia = vi.fn();

const ANDROID: CameraCapabilities = {
  focusMode: ["continuous", "single-shot"],
  torch: true,
  zoom: { min: 1, max: 8 },
  pointsOfInterest: true,
};

function fakeStream(capabilities: CameraCapabilities = ANDROID) {
  const track = {
    kind: "video",
    stop: stopTrack,
    getCapabilities: () => capabilities,
    applyConstraints: (constraints: { advanced?: Record<string, unknown>[] }) => {
      applied.push(...(constraints.advanced ?? []));
      return Promise.resolve();
    },
  };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

// A 1080p stream shown full bleed on a portrait phone.
const FRAME_BOX = { left: 0, top: 0, width: 390, height: 844 };
const GUIDE_BOX = { left: 23, top: 334, width: 343, height: 176 };

function boxFor(element: Element): DOMRect {
  const box = element.tagName === "VIDEO" ? FRAME_BOX : GUIDE_BOX;
  return {
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => box,
  } as DOMRect;
}

beforeEach(() => {
  applied.length = 0;
  startScanner.mockReset();
  stopScanner.mockReset();
  stopTrack.mockReset();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue(fakeStream());

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  // jsdom implements none of these.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    value: 1920,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    value: 1080,
  });
  Element.prototype.getBoundingClientRect = function () {
    return boxFor(this);
  };
});

afterEach(cleanup);

async function open(props: Partial<Parameters<typeof BarcodeScanner>[0]> = {}) {
  await act(async () => {
    render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} {...props} />);
  });
}

const scannerOptions = () => startScanner.mock.calls[0][0] as ScannerOptions;

describe("BarcodeScanner", () => {
  // At the browser's default capture size, around 640x480 on a phone, the thin
  // bars of a barcode land in the same pixel as their neighbours.
  it("asks for the back camera at a size the bars survive", async () => {
    await open();

    const video = getUserMedia.mock.calls[0][0].video as MediaTrackConstraints;
    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(video.width).toEqual({ ideal: 1920 });
  });

  // Callers pass a plain function declared in their own render, so its identity
  // changes constantly. When that sat in the effect's dependencies the stream
  // was re-acquired on every parent state change and autofocus began again each
  // time, so it never settled.
  it("does not restart the camera when the parent re-renders", async () => {
    function Parent() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN(n + 1)}>bump {n}</button>
          {/* A new function identity on each render, as the real callers have. */}
          <BarcodeScanner onDetected={() => {}} onClose={() => {}} />
        </>
      );
    }

    await act(async () => {
      render(<Parent />);
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /bump/i }));
    await userEvent.click(screen.getByRole("button", { name: /bump/i }));

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stopScanner).not.toHaveBeenCalled();
  });

  it("reports a scan to the latest callback", async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(<BarcodeScanner onDetected={first} onClose={vi.fn()} />);
    await act(async () => {});
    rerender(<BarcodeScanner onDetected={second} onClose={vi.fn()} />);

    act(() => scannerOptions().onDetected("5000112637922"));

    expect(second).toHaveBeenCalledWith("5000112637922");
    expect(first).not.toHaveBeenCalled();
  });

  // The component owns getUserMedia now, so it owns releasing it. A live camera
  // left running behind a closed overlay keeps the phone's light on and its
  // battery draining.
  it("releases the camera when the overlay goes away", async () => {
    const { unmount } = render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    unmount();

    expect(stopScanner).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
  });

  describe("the picture it asks the camera for", () => {
    it("keeps the camera focusing rather than letting it lock once", async () => {
      await open();
      expect(applied).toContainEqual({ focusMode: "continuous" });
    });

    // Filling the guide from a hand's width away is inside the minimum focus
    // distance of a phone's main camera. Zooming fills it from arm's length,
    // where the camera can actually focus.
    it("zooms in so the barcode fills the guide from a focusable distance", async () => {
      await open();
      expect(applied).toContainEqual({ zoom: 2 });
    });

    it("asks for no zoom of a camera that has none", async () => {
      getUserMedia.mockResolvedValue(fakeStream({ focusMode: ["continuous"] }));
      await open();

      expect(applied.some((constraint) => "zoom" in constraint)).toBe(false);
    });
  });

  describe("the crop it decodes", () => {
    // object-cover hides roughly three quarters of a 16:9 frame's width on a
    // portrait phone. Decoding the whole frame spent most of every attempt on
    // pixels the user could not see.
    it("reads the guide, not the whole frame", async () => {
      await open();

      const rect = scannerOptions().aim()!;
      expect(rect).not.toBeNull();
      expect(rect.width * rect.height).toBeLessThan(1920 * 1080 * 0.25);
      expect(rect.x).toBeGreaterThan(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1920);
    });

    it("centres the crop where the guide is", async () => {
      await open();

      const rect = scannerOptions().aim()!;
      expect(Math.abs(rect.x + rect.width / 2 - 960)).toBeLessThan(5);
      expect(Math.abs(rect.y + rect.height / 2 - 540)).toBeLessThan(5);
    });
  });

  describe("the light", () => {
    it("offers the light when the camera has one", async () => {
      await open();
      expect(screen.getByRole("button", { name: /turn on the light/i })).toBeTruthy();
    });

    it("offers nothing when the camera has none", async () => {
      getUserMedia.mockResolvedValue(fakeStream({ focusMode: ["continuous"] }));
      await open();

      expect(screen.queryByRole("button", { name: /light/i })).toBeNull();
    });

    // A dim kitchen is where this fails worst: the sensor holds the shutter open
    // and hand shake smears the bars.
    it("turns itself on when the picture stays dark", async () => {
      await open();

      await act(async () => {
        for (let i = 0; i < 20; i++) {
          scannerOptions().onReading!({ sharpness: 10, brightness: 20 });
        }
      });

      expect(applied).toContainEqual({ torch: true });
      expect(screen.getByRole("button", { name: /turn off the light/i })).toBeTruthy();
    });

    it("leaves it alone in a well lit room", async () => {
      await open();

      await act(async () => {
        for (let i = 0; i < 20; i++) {
          scannerOptions().onReading!({ sharpness: 10, brightness: 190 });
        }
      });

      expect(applied).not.toContainEqual({ torch: true });
    });

    it("lets the user turn it on themselves", async () => {
      await open();
      await userEvent.click(screen.getByRole("button", { name: /turn on the light/i }));

      expect(applied).toContainEqual({ torch: true });
    });
  });

  // The old tap handler asked for a fresh focus pass but never said where to
  // look, so the camera was as free to settle on the background as on the pack.
  it("tells the camera where to focus when the preview is tapped", async () => {
    const { container } = render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    await act(async () => {});

    await userEvent.click(container.querySelector("video")!);

    const focus = applied.find((constraint) => "pointsOfInterest" in constraint);
    expect(focus).toBeTruthy();
    const [point] = focus!.pointsOfInterest as { x: number; y: number }[];
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(1);
    expect(focus!.focusMode).toBe("single-shot");
  });

  // A crease across the bars or a curved tin can defeat any camera. The digits
  // are printed underneath for exactly that reason.
  it("accepts the number typed by hand when the camera can't read it", async () => {
    const onDetected = vi.fn();
    await open({ onDetected });

    await userEvent.click(screen.getByRole("button", { name: /type the number/i }));
    await userEvent.type(screen.getByLabelText(/barcode number/i), "8720182355560");
    await userEvent.click(screen.getByRole("button", { name: /find it/i }));

    expect(onDetected).toHaveBeenCalledWith("8720182355560");
  });

  it("won't look up a number too short to be a barcode", async () => {
    const onDetected = vi.fn();
    await open({ onDetected });

    await userEvent.click(screen.getByRole("button", { name: /type the number/i }));
    await userEvent.type(screen.getByLabelText(/barcode number/i), "87201");

    expect(screen.getByRole("button", { name: /find it/i })).toHaveProperty("disabled", true);
    expect(onDetected).not.toHaveBeenCalled();
  });

  describe("when the camera will not open", () => {
    it("says how to put it right when permission was refused", async () => {
      getUserMedia.mockRejectedValue(
        Object.assign(new Error("denied"), { name: "NotAllowedError" }),
      );
      await open();

      expect(screen.getByText(/browser settings/i)).toBeTruthy();
    });

    it("explains itself for any other failure", async () => {
      getUserMedia.mockRejectedValue(new Error("NotReadableError"));
      await open();

      expect(screen.getByText(/check permissions/i)).toBeTruthy();
    });
  });
});
