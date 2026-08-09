"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, X, Zap, ZapOff } from "lucide-react";
import {
  CAMERA_CONSTRAINTS,
  applyZoom,
  capabilitiesOf,
  focusOn,
  preferContinuousFocus,
  setTorch,
  targetZoom,
  videoTrack,
} from "@/lib/barcode/camera";
import { normalizedPoint, sourceRect } from "@/lib/barcode/roi";
import { startScanner, type Scanner } from "@/lib/barcode/scan";
import type { FrameReading } from "@/lib/barcode/sharpness";

// A barcode that pokes a little outside the guide is still one the user meant
// to scan, and a decoder needs the quiet zone either side of the bars to find
// their edges at all.
const GUIDE_PAD = 0.12;

// How long a tapped focus point is held before continuous autofocus takes over
// again. Long enough for the lens to finish hunting and for the user to see it
// worked, short enough that the camera goes back to tracking on its own.
const FOCUS_HOLD_MS = 2500;

// Turning the light on does two things for a barcode: it fixes the exposure, so
// the shutter closes fast enough that hand shake stops smearing the bars, and
// it lifts the contrast between bar and background. Worth doing unheeded in a
// dim kitchen, not worth doing at all in daylight, so it waits to see the
// picture rather than being on or off from the start.
const DIM_BRIGHTNESS = 60;
const DIM_FRAMES = 15;
const TORCH_DECISION_FRAMES = 90;

// A barcode number as printed under the bars: 8 digits (EAN-8) up to 14 (ITF-14).
const TYPED_BARCODE = /^\d{8,14}$/;

// Full-screen camera overlay. Streams the back camera, reads the crop the user
// framed, and fires onDetected with the first code it reads. The caller closes
// the overlay (usually inside onDetected).
export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const focusTimer = useRef<number | undefined>(undefined);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // Null until the stream is up and we know whether the camera has a light.
  const [torchOn, setTorchOn] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");

  // Every caller passes a plain function declared in its own render, so
  // `onDetected` has a new identity each time the parent re-renders. With it in
  // the effect's dependencies the camera was torn down and re-acquired on any
  // parent state change, and each restart began autofocus from scratch, so the
  // stream never got the still moment it needs to settle.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  // Where the guide sits on the camera's own frame. Measured rather than
  // assumed, because object-cover's crop depends on both the stream's shape and
  // the viewport's, and the phone can be turned over mid-scan.
  const aim = useCallback(() => {
    const video = videoRef.current;
    const guide = guideRef.current;
    if (!video || !guide) return null;

    const frame = video.getBoundingClientRect();
    const box = guide.getBoundingClientRect();
    return sourceRect(
      { width: video.videoWidth, height: video.videoHeight },
      { width: frame.width, height: frame.height },
      {
        x: box.left - frame.left,
        y: box.top - frame.top,
        width: box.width,
        height: box.height,
      },
      GUIDE_PAD,
    );
  }, []);

  // Decided from the picture the camera is actually returning, and only once.
  const torchDecided = useRef(false);
  const dimFrames = useRef(0);
  const seenFrames = useRef(0);
  const considerTorch = useCallback((reading: FrameReading) => {
    if (torchDecided.current) return;

    const track = videoTrack(videoRef.current);
    if (!track || !capabilitiesOf(track).torch) {
      torchDecided.current = true;
      return;
    }

    seenFrames.current += 1;
    if (seenFrames.current > TORCH_DECISION_FRAMES) {
      // Light enough for long enough. Leave it to the user from here.
      torchDecided.current = true;
      return;
    }

    dimFrames.current = reading.brightness < DIM_BRIGHTNESS ? dimFrames.current + 1 : 0;
    if (dimFrames.current < DIM_FRAMES) return;

    torchDecided.current = true;
    void setTorch(track, true).then((applied) => {
      if (applied) setTorchOn(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanner: Scanner | null = null;

    navigator.mediaDevices
      .getUserMedia(CAMERA_CONSTRAINTS)
      .then(async (opened) => {
        if (cancelled) {
          opened.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = opened;

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = opened;
        // Some browsers reject this when the element is torn down under them,
        // which is not a failure worth reporting to the user.
        await video.play().catch(() => {});
        if (cancelled) return;

        setStarting(false);

        const track = opened.getVideoTracks()[0] ?? null;
        if (track) {
          void preferContinuousFocus(track);
          // Zoom is what lets the barcode fill the guide from a distance the
          // camera can focus at. See targetZoom.
          const zoom = targetZoom(capabilitiesOf(track).zoom);
          if (zoom !== null) void applyZoom(track, zoom);
          if (capabilitiesOf(track).torch) setTorchOn(false);
        }

        scanner = startScanner({
          video,
          aim,
          onReading: considerTorch,
          onDetected: (barcode) => onDetectedRef.current(barcode),
        });
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const name = reason instanceof Error ? reason.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera access is off for this site. Turn it on in your browser settings."
            : "Can't open the camera. Check permissions.",
        );
      });

    return () => {
      cancelled = true;
      scanner?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      window.clearTimeout(focusTimer.current);
    };
  }, [aim, considerTorch]);

  const toggleTorch = useCallback(() => {
    const track = videoTrack(videoRef.current);
    if (!track) return;

    // A choice made by hand settles it: stop second guessing from the picture.
    torchDecided.current = true;
    const next = !torchOn;
    void setTorch(track, next).then((applied) => {
      if (applied) setTorchOn(next);
    });
  }, [torchOn]);

  // Continuous autofocus stops hunting once it believes it has a lock, and a
  // phone held over a packet is exactly where it locks onto the wrong plane.
  // A tap says where to look, then hands the camera back to continuous.
  const refocus = useCallback((event: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    const track = videoTrack(video);
    if (!video || !track) return;

    const frame = video.getBoundingClientRect();
    const point = normalizedPoint(
      { width: video.videoWidth, height: video.videoHeight },
      { width: frame.width, height: frame.height },
      { x: event.clientX - frame.left, y: event.clientY - frame.top },
    );
    if (!point) return;

    void focusOn(track, point);
    window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      void preferContinuousFocus(videoTrack(videoRef.current));
    }, FOCUS_HOLD_MS);
  }, []);

  // Some barcodes will not read however good the picture is: a crease across
  // the bars, a curved tin, a torn label. The digits are printed underneath for
  // exactly this reason, so let them be typed rather than making the user give
  // up on the product.
  function submitTyped() {
    const digits = typed.replace(/\D/g, "");
    if (!TYPED_BARCODE.test(digits)) return;
    onDetectedRef.current(digits);
  }

  const hint = starting
    ? "Starting the camera."
    : "Hold the phone about arm's length away and put the barcode in the box. Tap to focus.";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        onClick={refocus}
        className="min-h-0 flex-1 object-cover"
        playsInline
        muted
      />

      {/* Aiming frame. Measured every frame, so this is what gets decoded. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={guideRef}
          className="h-44 w-[88%] max-w-md rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-4">
        <p className="rounded-2xl bg-black/50 px-4 py-2 text-sm font-semibold text-white">
          {error ?? hint}
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
