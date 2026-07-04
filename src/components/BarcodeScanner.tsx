"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

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

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result, _err, ctrl) => {
          if (cancelled) return;
          controls = ctrl;
          if (result) {
            ctrl.stop();
            onDetected(result.getText());
          }
        },
      )
      .then((ctrl) => {
        controls = ctrl;
      })
      .catch(() => {
        if (!cancelled) setError("Can't open the camera. Check permissions.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDetected]);

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
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-xl text-white active:scale-90"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
