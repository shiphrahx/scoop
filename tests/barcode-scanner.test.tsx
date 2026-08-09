// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// zxing owns the camera; stub it so the component's request is observable
// without a real MediaStream.
const decodeFromConstraints = vi.fn();
const stop = vi.fn();
const readerArgs = vi.fn();
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints = decodeFromConstraints;
    constructor(hints?: unknown, options?: unknown) {
      readerArgs(hints, options);
    }
  },
}));

const { default: BarcodeScanner } = await import("@/components/BarcodeScanner");

type DecodeCallback = (
  result: { getText: () => string } | null,
  err: unknown,
  ctrl: { stop: () => void },
) => void;

// The video constraints from the most recent open.
const videoConstraints = () =>
  decodeFromConstraints.mock.calls[0][0].video as MediaTrackConstraints;

const lastCallback = () => decodeFromConstraints.mock.calls[0][2] as DecodeCallback;

const hints = () => readerArgs.mock.calls[0][0] as Map<DecodeHintType, unknown>;
const readerOptions = () =>
  readerArgs.mock.calls[0][1] as { delayBetweenScanAttempts?: number };

beforeEach(() => {
  decodeFromConstraints.mockReset();
  stop.mockReset();
  readerArgs.mockReset();
  decodeFromConstraints.mockResolvedValue({ stop });
});

afterEach(cleanup);

describe("BarcodeScanner", () => {
  // The reported symptom: a picture too soft to read a barcode from. Asking only
  // for facingMode leaves the browser on its default capture size (~640x480 on a
  // phone), at which the thin bars blur together.
  it("asks for a high-resolution stream, not the browser default", async () => {
    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    const video = videoConstraints();
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
  });

  // ideal, never exact: a camera that cannot manage 1080p has to fall back
  // rather than fail to open.
  it("makes every camera preference an ideal so a weaker camera still opens", async () => {
    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    const video = videoConstraints() as Record<string, unknown>;
    for (const key of ["facingMode", "width", "height"]) {
      expect(Object.keys(video[key] as object)).toEqual(["ideal"]);
    }
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
    expect(decodeFromConstraints).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /bump/i }));
    await userEvent.click(screen.getByRole("button", { name: /bump/i }));

    expect(decodeFromConstraints).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  // Holding the callback in a ref must not staple the scanner to the first one
  // it was given, a scan reports to whichever callback is current.
  it("reports a scan to the latest callback", async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = render(
      <BarcodeScanner onDetected={first} onClose={vi.fn()} />,
    );
    await act(async () => {});
    rerender(<BarcodeScanner onDetected={second} onClose={vi.fn()} />);

    const ctrl = { stop: vi.fn() };
    act(() => {
      lastCallback()({ getText: () => "5000112637922" }, null, ctrl);
    });

    expect(second).toHaveBeenCalledWith("5000112637922");
    expect(first).not.toHaveBeenCalled();
    // And the camera is released as soon as a code is read.
    expect(ctrl.stop).toHaveBeenCalled();
  });

  // A food packet only ever carries a retail 1D symbology. Hunting QR, Aztec,
  // PDF417 and Data Matrix on every attempt spends the decode budget on things
  // that cannot be there, and it's that budget which pays for TRY_HARDER, the
  // slower pass that copes with the soft picture a phone actually produces.
  it("looks only for the barcodes that appear on food packaging, and tries hard", async () => {
    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    const formats = hints().get(DecodeHintType.POSSIBLE_FORMATS) as BarcodeFormat[];
    expect(formats).toContain(BarcodeFormat.EAN_13);
    expect(formats).toContain(BarcodeFormat.UPC_A);
    expect(formats).not.toContain(BarcodeFormat.QR_CODE);
    expect(hints().get(DecodeHintType.TRY_HARDER)).toBe(true);
  });

  // zxing's default is 500ms, so autofocus is only judged twice a second and the
  // brief moment a hand-held phone is sharp is usually missed entirely.
  it("samples far more often than the zxing default", async () => {
    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    expect(readerOptions().delayBetweenScanAttempts).toBeLessThan(500);
  });

  // A crease across the bars or a curved tin can defeat any camera. The digits
  // are printed underneath for exactly that reason.
  it("accepts the number typed by hand when the camera can't read it", async () => {
    const onDetected = vi.fn();
    await act(async () => {
      render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />);
    });

    await userEvent.click(screen.getByRole("button", { name: /type the number/i }));
    await userEvent.type(screen.getByLabelText(/barcode number/i), "8720182355560");
    await userEvent.click(screen.getByRole("button", { name: /find it/i }));

    expect(onDetected).toHaveBeenCalledWith("8720182355560");
  });

  // Too few digits is a mistyped code, not a product, sending it would just
  // return "not found" and read as the scanner being broken again.
  it("won't look up a number too short to be a barcode", async () => {
    const onDetected = vi.fn();
    await act(async () => {
      render(<BarcodeScanner onDetected={onDetected} onClose={vi.fn()} />);
    });

    await userEvent.click(screen.getByRole("button", { name: /type the number/i }));
    await userEvent.type(screen.getByLabelText(/barcode number/i), "87201");

    expect(screen.getByRole("button", { name: /find it/i })).toHaveProperty(
      "disabled",
      true,
    );
    expect(onDetected).not.toHaveBeenCalled();
  });

  it("explains itself when the camera cannot be opened", async () => {
    decodeFromConstraints.mockRejectedValue(new Error("NotAllowedError"));

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    expect(screen.getByText(/check permissions/i)).toBeTruthy();
  });
});
