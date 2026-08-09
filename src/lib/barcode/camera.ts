// Talking the phone camera into a picture a barcode can be read from.
//
// Everything here is best effort. These are optional camera controls, uneven
// across Android and absent on iOS Safari, and none of them is worth failing
// the scan over: a refused constraint still leaves a working stream. They are
// applied after the stream exists rather than inside the getUserMedia request,
// because a constraint the device does not know in the initial set can stop the
// camera opening at all.

import type { Point } from "./roi";

// What we ask for up front. All ideal, never exact, so a weaker camera degrades
// instead of failing to open.
//
// The resolution matters because a barcode is thin parallel lines: at the
// browser's default capture size, around 640x480 on a phone, neighbouring bars
// land in the same pixel and no decoder can recover them.
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

// A range as the camera reports it. Chrome calls this a MediaSettingsRange.
export interface Range {
  min: number;
  max: number;
  step?: number;
}

// focusMode, torch, zoom and pointsOfInterest are all shipped by Chrome on
// Android and none of them is in lib.dom's typings.
export type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: Range;
  pointsOfInterest?: unknown;
};

export function capabilitiesOf(track: MediaStreamTrack | null): CameraCapabilities {
  try {
    return (track?.getCapabilities?.() as CameraCapabilities | undefined) ?? {};
  } catch {
    // Some browsers throw here rather than returning an empty set.
    return {};
  }
}

function applyAdvanced(
  track: MediaStreamTrack,
  constraint: Record<string, unknown>,
): Promise<boolean> {
  return track
    .applyConstraints({ advanced: [constraint] } as unknown as MediaTrackConstraints)
    .then(() => true)
    .catch(() => false);
}

// How far to zoom in for scanning.
//
// This is the fix for the instruction that could not be followed. Filling the
// frame at "a hand's width away" puts the packet inside the minimum focus
// distance of a phone's main camera, roughly 8 to 12cm, where it physically
// cannot focus, so the harder the user tried the blurrier it got. Zooming lets
// them hold the phone at arm's length, comfortably in focus, with the barcode
// still filling the guide.
//
// The factor is applied to the range's own floor rather than assumed to be 1,
// because some Android cameras report zoom as a percentage, 100 to 400, rather
// than as a multiplier.
export function targetZoom(range: Range | undefined, factor = 2): number | null {
  if (!range || !(range.max > range.min) || !(range.min > 0)) return null;
  // A camera that can barely zoom is not worth the constraint round trip.
  if (range.max / range.min < 1.2) return null;

  const target = Math.min(range.min * factor, range.max);
  if (!range.step || range.step <= 0) return target;
  // Snap up to a step the camera will actually accept.
  return Math.min(range.min + Math.ceil((target - range.min) / range.step) * range.step, range.max);
}

export function applyZoom(track: MediaStreamTrack, zoom: number): Promise<boolean> {
  return applyAdvanced(track, { zoom });
}

export function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  return applyAdvanced(track, { torch: on });
}

// Keep refocusing while the scanner is open. Left alone a phone focuses once,
// as the stream starts, on whatever was in front of it before the user raised
// the packet, and never corrects.
export function preferContinuousFocus(track: MediaStreamTrack | null): Promise<boolean> {
  if (!track || !capabilitiesOf(track).focusMode?.includes("continuous")) {
    return Promise.resolve(false);
  }
  return applyAdvanced(track, { focusMode: "continuous" });
}

// Focus on a point the user tapped, given as a fraction of the frame.
//
// Continuous autofocus stops hunting once it believes it has a lock, and a
// phone held over a packet is exactly where it locks onto the wrong plane. The
// old code asked for a fresh single-shot pass but never said where to look, so
// the camera was as likely to settle on the background again. pointsOfInterest
// is the part that tells it.
export function focusOn(track: MediaStreamTrack | null, point: Point): Promise<boolean> {
  if (!track) return Promise.resolve(false);

  const caps = capabilitiesOf(track);
  const constraint: Record<string, unknown> = {};
  if ("pointsOfInterest" in caps) constraint.pointsOfInterest = [point];
  if (caps.focusMode?.includes("single-shot")) constraint.focusMode = "single-shot";
  if (Object.keys(constraint).length === 0) return Promise.resolve(false);

  return applyAdvanced(track, constraint);
}

export function videoTrack(video: HTMLVideoElement | null): MediaStreamTrack | null {
  return (video?.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
}
