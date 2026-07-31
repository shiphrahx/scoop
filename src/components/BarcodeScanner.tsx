"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

// What we ask the camera for.
//
// Asking only for `facingMode` lets the browser pick the default capture size,
// which on phones is around 640x480 — a heavy downscale of the sensor. A barcode
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

// `focusMode` is supported on Android Chrome but isn't in lib.dom's typings yet.
type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };

// Ask the camera to keep refocusing while the overlay is open.
//
// Left alone, a phone focuses once when the stream starts — on whatever was in
// front of it then, usually not the barcode the user hasn't raised yet — and
// never corrects. Applied after the stream exists, and only when the device says
// it can, because an unsupported constraint in the initial getUserMedia set
// would reject the whole request and the camera would not open.
function preferContinuousFocus(video: HTMLVideoElement | null): void {
  const track = (video?.srcObject as MediaStream | null)?.getVideoTracks()[0];
  const modes = (track?.getCapabilities?.() as FocusCapabilities | undefined)?.focusMode;
  if (!track || !modes?.includes("continuous")) return;
  track
    .applyConstraints({
      advanced: [{ focusMode: "continuous" }],
    } as unknown as MediaTrackConstraints)
    .catch(() => {
      // Best effort: a refused focus hint still leaves a usable stream.
    });
}

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

  // Every caller passes a plain function declared in its own render, so
  // `onDetected` has a new identity each time the parent re-renders. With it in
  // the effect's dependencies the camera was torn down and re-acquired on any
  // parent state change, and each restart began autofocus again from scratch —
  // the stream never got the still moment it needs to settle. Hold it in a ref
  // so the effect below runs once per open.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

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
        if (!cancelled) preferContinuousFocus(videoRef.current);
      })
      .catch(() => {
        if (!cancelled) setError("Can't open the camera. Check permissions.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        className="min-h-0 flex-1 object-cover"
        playsInline
        muted
      />

      {/* Aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-40 w-72 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <p className="rounded-full bg-black/50 px-4 py-2 text-sm font-semibold text-white">
          {error ?? "Point at a barcode"}
        </p>
        <button
          onClick={onClose}
          aria-label="Close scanner"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white active:scale-90"
        >
          <X size={22} />
        </button>
      </div>
    </div>
  );
}
