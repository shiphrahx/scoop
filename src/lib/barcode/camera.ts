// Talking the phone camera into a picture a barcode can be read from.
//
// Everything here is best effort. These are optional camera controls, uneven
// across Android and absent on iOS Safari, and none of them is worth failing
// the scan over: a refused constraint still leaves a working stream. They are
// applied after the stream exists rather than inside the getUserMedia request,
// because a constraint the device does not know in the initial set can stop the
// camera opening at all.
//
// The important thing about applyConstraints, and the thing the old code here
// got wrong, is that it replaces the track's whole constraint set rather than
// merging into it. Asking for continuous focus and then asking for zoom does
// not leave a camera that is focusing and zoomed, it leaves a camera that is
// zoomed, with the focus request thrown away. So every control goes through one
// object that remembers everything asked for so far and sends the lot each
// time, one call at a time.

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

// How far to zoom in for scanning.
//
// Filling the frame at "a hand's width away" puts the packet inside the minimum
// focus distance of a phone's main camera, roughly 8 to 12cm, where it
// physically cannot focus, so the harder the user tried the blurrier it got.
// Zooming lets them hold the phone at arm's length, comfortably in focus, with
// the barcode still filling the guide.
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

// A patch of camera controls. A key set to undefined is one being taken back
// off the camera rather than left at its old value.
export type ControlPatch = Record<string, unknown>;

export interface CameraControls {
  // Focus and zoom together, which is the pair the scanner opens with.
  start(zoomFactor?: number): Promise<void>;
  // Keep refocusing while the scanner is open. Left alone a phone focuses once,
  // as the stream starts, on whatever was in front of it before the user raised
  // the packet, and never corrects.
  focusContinuously(): Promise<boolean>;
  // Focus on a point the user tapped, given as a fraction of the frame.
  //
  // Continuous autofocus stops hunting once it believes it has a lock, and a
  // phone held over a packet is exactly where it locks onto the wrong plane.
  // Asking for a fresh single-shot pass without saying where to look leaves the
  // camera as likely to settle on the background again. pointsOfInterest is the
  // part that tells it.
  focusAt(point: Point): Promise<boolean>;
  setZoom(zoom: number): Promise<boolean>;
  setTorch(on: boolean): Promise<boolean>;
  // Everything the camera is currently being asked for, what it says it can
  // do, and what it settled on. All three are for the diagnostics panel: with
  // three rounds of fixes gone by on a bug nobody can reproduce on the machine
  // they are fixing it from, being able to read what the phone actually did
  // beats another guess.
  asked(): ControlPatch;
  capabilities(): CameraCapabilities;
  settled(): CameraSettings;
}

// What the camera says it is doing, as opposed to what it was asked for. The
// four optional keys are Chrome on Android's, and none is in lib.dom.
export type CameraSettings = MediaTrackSettings & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
  // Which lens the browser picked. On a phone with three back cameras this is
  // the difference between the main one and a fixed-focus ultra wide.
  label?: string;
};

export function cameraControls(track: MediaStreamTrack | null): CameraControls {
  const caps = capabilitiesOf(track);
  // Everything asked for so far, resent in full on every call.
  let asked: ControlPatch = {};
  // Calls are chained rather than fired off together. Two applyConstraints in
  // flight at once on Chrome for Android is how you get one of them refused for
  // no reason the user could act on.
  let queue: Promise<boolean> = Promise.resolve(true);

  function apply(patch: ControlPatch): Promise<boolean> {
    if (!track) return Promise.resolve(false);

    queue = queue.then(() => {
      const before = asked;
      const next = { ...asked, ...patch };
      for (const key of Object.keys(next)) {
        if (next[key] === undefined) delete next[key];
      }
      if (Object.keys(next).length === 0) return false;

      asked = next;
      return track
        .applyConstraints({ advanced: [next] } as unknown as MediaTrackConstraints)
        .then(() => true)
        .catch(() => {
          // A refused set leaves the track as it was, so the record of what it
          // is doing has to go back too.
          asked = before;
          return false;
        });
    });

    return queue;
  }

  const canFocus = (mode: string) => caps.focusMode?.includes(mode) ?? false;

  function focusPatch(): ControlPatch | null {
    return canFocus("continuous") ? { focusMode: "continuous", pointsOfInterest: undefined } : null;
  }

  return {
    async start(zoomFactor) {
      const patch: ControlPatch = { ...focusPatch() };
      const zoom = targetZoom(caps.zoom, zoomFactor);
      if (zoom !== null) patch.zoom = zoom;
      if (Object.keys(patch).length === 0) return;
      await apply(patch);
    },

    focusContinuously() {
      const patch = focusPatch();
      return patch ? apply(patch) : Promise.resolve(false);
    },

    focusAt(point) {
      const patch: ControlPatch = {};
      if ("pointsOfInterest" in caps) patch.pointsOfInterest = [point];
      if (canFocus("single-shot")) patch.focusMode = "single-shot";
      if (Object.keys(patch).length === 0) return Promise.resolve(false);
      return apply(patch);
    },

    setZoom(zoom) {
      return apply({ zoom });
    },

    setTorch(on) {
      return apply({ torch: on });
    },

    asked: () => ({ ...asked }),
    capabilities: () => caps,

    settled() {
      try {
        return { ...(track?.getSettings() as CameraSettings), label: track?.label };
      } catch {
        return {};
      }
    },
  };
}

export function videoTrack(video: HTMLVideoElement | null): MediaStreamTrack | null {
  return (video?.srcObject as MediaStream | null)?.getVideoTracks()[0] ?? null;
}
