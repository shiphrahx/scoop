// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// zxing owns the camera; stub it so the component's request is observable
// without a real MediaStream.
const decodeFromConstraints = vi.fn();
const stop = vi.fn();
vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints = decodeFromConstraints;
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

beforeEach(() => {
  decodeFromConstraints.mockReset();
  stop.mockReset();
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
  // it was given — a scan reports to whichever callback is current.
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

  it("explains itself when the camera cannot be opened", async () => {
    decodeFromConstraints.mockRejectedValue(new Error("NotAllowedError"));

    await act(async () => {
      render(<BarcodeScanner onDetected={vi.fn()} onClose={vi.fn()} />);
    });

    expect(screen.getByText(/check permissions/i)).toBeTruthy();
  });
});
