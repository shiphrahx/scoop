"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, X, Zap, ZapOff } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

// What we ask the camera for.
//
// Asking only for `facingMode` lets the browser pick the default capture size,
// which on phones is around 640x480, a heavy downscale of the sensor. A barcode
// is a set of thin parallel lines, and at that size the narrow bars blur into
// their neighbours, so the picture looks soft and zxing has nothing crisp enough
// to decode. Ask for 1080p instead. All three are `ideal`, not exact, so a
// camera that can't manage it degrades rather than failing to open at all.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

// The only barcodes that appear on food packaging. Left unrestricted, the
// multi-format reader spends every attempt looking for QR, Aztec, PDF417 and
// Data Matrix too, which is most of the decode budget burnt on symbologies that
// cannot be on the pack. Narrowing the list is what makes TRY_HARDER affordable:
// it runs the slower, more forgiving pass, the one that copes with a soft or
// low-contrast image, which is exactly the picture a phone gives us, and still
// finishes inside a frame.
const RETAIL_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
];

const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, RETAIL_FORMATS],
  [DecodeHintType.TRY_HARDER, true],
]);

// zxing waits half a second between attempts by default, so autofocus only gets
// judged twice a second and most of the sharp frames it produces are thrown
// away unread. Sample far more often, the frames are already being captured,
// and a barcode is usually only crisp for a moment.
const READER_OPTIONS = { delayBetweenScanAttempts: 120 };

// `focusMode` and `torch` are supported on Android Chrome but aren't in
// lib.dom's typings yet.
type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

function videoTrack(video: HTMLVideoElement | null): MediaStreamTrack | null {
  return (video?.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
}

function capabilitiesOf(track: MediaStreamTrack | null): CameraCapabilities {
  try {
    return (track?.getCapabilities?.() as CameraCapabilities | undefined) ?? {};
  } catch {
    // Some browsers throw rather than returning an empty set.
    return {};
  }
}

// Applied after the stream exists, and only when the device says it can, because
// an unsupported constraint in the initial getUserMedia set would reject the
// whole request and the camera would not open.
function applyFocusMode(track: MediaStreamTrack, mode: string): Promise<void> {
  return track
    .applyConstraints({ advanced: [{ focusMode: mode }] } as unknown as MediaTrackConstraints)
    .catch(() => {
      // Best effort: a refused focus hint still leaves a usable stream.
    });
}

// Ask the camera to keep refocusing while the overlay is open.
//
// Left alone, a phone focuses once when the stream starts, on whatever was in
// front of it then, usually not the barcode the user hasn't raised yet, and
// never corrects.
function preferContinuousFocus(video: HTMLVideoElement | null): void {
  const track = videoTrack(video);
  const modes = capabilitiesOf(track).focusMode;
  if (!track || !modes?.includes("continuous")) return;
  void applyFocusMode(track, "continuous");
}

// A barcode number as printed under the bars: 8 digits (EAN-8) up to 14 (ITF-14).
const TYPED_BARCODE = /^\d{8,14}$/;

// Full-screen camera overlay. Streams the back camera, decodes barcodes with
// zxing, and fires onDetected with the first code it reads. The caller closes
// the overlay (usually inside onDetected).
export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Null until the stream is up and we know whether the camera has a light.
  const [torchOn, setTorchOn] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  // Every caller passes a plain function declared in its own render, so
  // `onDetected` has a new identity each time the parent re-renders. With it in
  // the effect's dependencies the camera was torn down and re-acquired on any
  // parent state change, and each restart began autofocus again from scratch,
  // the stream never got the still moment it needs to settle. Hold it in a ref
  // so the effect below runs once per open.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader(HINTS, READER_OPTIONS);

    reader
      .decodeFromConstraints(CAMERA_CONSTRAINTS, videoRef.current!, (result, _err, ctrl) => {
        if (cancelled) return;
        controls = ctrl;
        if (result) {
          ctrl.stop();
          onDetectedRef.current(result.getText());
        }
      })
      .then((ctrl) => {
        controls = ctrl;
        if (cancelled) return;
        preferContinuousFocus(videoRef.current);
        if (capabilitiesOf(videoTrack(videoRef.current)).torch) setTorchOn(false);
      })
      .catch(() => {
        if (!cancelled) setError("Can't open the camera. Check permissions.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  // Kitchen light is dim and a packet is shiny, so the sensor holds the shutter
  // open and hand-shake smears the bars. The light both fixes the exposure and
  // gives the autofocus something to lock onto.
  const toggleTorch = useCallback(() => {
    const track = videoTrack(videoRef.current);
    if (!track) return;
    const next = !torchOn;
    track
      .applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      .then(() => setTorchOn(next))
      .catch(() => {
        // Camera refused the light; leave the button where it was.
      });
  }, [torchOn]);

  // Continuous autofocus gives up once it thinks it has a lock, and a phone held
  // close to a packet is exactly where it locks on the wrong plane. Tapping
  // kicks it: one single-shot pass to re-hunt, then back to continuous.
  const refocus = useCallback(() => {
    const track = videoTrack(videoRef.current);
    const modes = capabilitiesOf(track).focusMode;
    if (!track || !modes?.includes("single-shot")) return;
    void applyFocusMode(track, "single-shot").then(() => {
      if (modes.includes("continuous")) void applyFocusMode(track, "continuous");
    });
  }, []);

  // Some barcodes will not read however good the picture is, a crease across
  // the bars, a curved tin, a torn label. The digits are printed underneath for
  // exactly this reason, so let them be typed rather than making the user give
  // up on the product.
  function submitTyped() {
    const digits = typed.replace(/\D/g, "");
    if (!TYPED_BARCODE.test(digits)) return;
    onDetectedRef.current(digits);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        onClick={refocus}
        className="min-h-0 flex-1 object-cover"
        playsInline
        muted
      />

      {/* Aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-40 w-72 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <p className="rounded-2xl bg-black/50 px-4 py-2 text-sm font-semibold text-white">
          {error ?? "Fill the frame with the barcode, about a hand's width away. Tap to refocus."}
        </p>
        <div className="flex shrink-0 gap-2">
          {torchOn != null && (
            <button
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn off the light" : "Turn on the light"}
              aria-pressed={torchOn}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
            >
              {torchOn ? <Zap size={22} /> : <ZapOff size={22} />}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close scanner"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-4">
        {typing ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitTyped();
              }}
              inputMode="numeric"
              placeholder="8720182355560"
              aria-label="Barcode number"
              className="min-w-0 flex-1 rounded-2xl bg-white/95 px-4 py-3 text-lg text-black"
            />
            <button
              onClick={submitTyped}
              disabled={!TYPED_BARCODE.test(typed.replace(/\D/g, ""))}
              className="shrink-0 rounded-2xl bg-white px-5 py-3 font-semibold text-black disabled:opacity-50"
            >
              Find it
            </button>
          </div>
        ) : (
          <button
            onClick={() => setTyping(true)}
            className="flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white"
          >
            <Keyboard size={16} /> Type the number instead
          </button>
        )}
      </div>
    </div>
  );
}
