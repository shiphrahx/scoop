import { describe, expect, it } from "vitest";
import {
  CAMERA_CONSTRAINTS,
  applyZoom,
  capabilitiesOf,
  focusOn,
  preferContinuousFocus,
  setTorch,
  targetZoom,
  videoTrack,
  type CameraCapabilities,
} from "@/lib/barcode/camera";

// A camera track as the browser hands it over: what it says it can do, and a
// record of what it was asked to do.
function fakeTrack(capabilities: CameraCapabilities, { refuses = false } = {}) {
  const applied: Record<string, unknown>[] = [];
  return {
    applied,
    track: {
      getCapabilities: () => capabilities,
      applyConstraints: (constraints: { advanced?: Record<string, unknown>[] }) => {
        if (refuses) return Promise.reject(new Error("OverconstrainedError"));
        applied.push(...(constraints.advanced ?? []));
        return Promise.resolve();
      },
    } as unknown as MediaStreamTrack,
  };
}

const ANDROID: CameraCapabilities = {
  focusMode: ["continuous", "single-shot", "manual"],
  torch: true,
  zoom: { min: 1, max: 8, step: 0.1 },
  pointsOfInterest: true,
};

describe("CAMERA_CONSTRAINTS", () => {
  // At the browser's default capture size, around 640x480 on a phone, the thin
  // bars of a barcode land in the same pixel as their neighbours.
  it("asks for a stream sharp enough to hold the bars apart", () => {
    const video = CAMERA_CONSTRAINTS.video as MediaTrackConstraints;

    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
  });

  // Ideal, never exact: a camera that cannot manage 1080p has to degrade rather
  // than fail to open.
  it("makes every preference an ideal so a weaker camera still opens", () => {
    const video = CAMERA_CONSTRAINTS.video as Record<string, unknown>;

    for (const key of ["facingMode", "width", "height"]) {
      expect(Object.keys(video[key] as object)).toEqual(["ideal"]);
    }
  });

  it("asks for the back camera and no microphone", () => {
    const video = CAMERA_CONSTRAINTS.video as MediaTrackConstraints;

    expect(video.facingMode).toEqual({ ideal: "environment" });
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
  });
});

describe("capabilitiesOf", () => {
  it("reads what the camera says it can do", () => {
    expect(capabilitiesOf(fakeTrack(ANDROID).track).torch).toBe(true);
  });

  it("reports nothing rather than failing when there is no track", () => {
    expect(capabilitiesOf(null)).toEqual({});
  });

  it("reports nothing rather than failing when the browser throws", () => {
    const track = {
      getCapabilities: () => {
        throw new Error("NotSupportedError");
      },
    } as unknown as MediaStreamTrack;

    expect(capabilitiesOf(track)).toEqual({});
  });
});

describe("targetZoom", () => {
  // The fix for an instruction nobody could follow. Filling the guide from a
  // hand's width away is inside the minimum focus distance of a phone's main
  // camera, so the harder the user tried the blurrier it got.
  it("doubles the camera's own baseline", () => {
    expect(targetZoom({ min: 1, max: 8 })).toBe(2);
  });

  // Some Android cameras report zoom as a percentage rather than a multiplier.
  it("doubles a range that counts in percent, not multiples", () => {
    expect(targetZoom({ min: 100, max: 400 })).toBe(200);
  });

  it("stops at the most the camera can do", () => {
    expect(targetZoom({ min: 1, max: 1.5 })).toBe(1.5);
  });

  it("snaps up to a step the camera will accept", () => {
    expect(targetZoom({ min: 1, max: 8, step: 0.3 })).toBeCloseTo(2.2, 6);
  });

  it("takes the factor it is given", () => {
    expect(targetZoom({ min: 1, max: 8 }, 3)).toBe(3);
  });

  it("leaves a camera that cannot zoom alone", () => {
    expect(targetZoom(undefined)).toBeNull();
    expect(targetZoom({ min: 1, max: 1 })).toBeNull();
    // Not enough range to be worth the round trip.
    expect(targetZoom({ min: 1, max: 1.1 })).toBeNull();
  });
});

describe("preferContinuousFocus", () => {
  // Left alone a phone focuses once, as the stream starts, on whatever was in
  // front of it before the user raised the packet, and never corrects.
  it("asks a camera that can keep focusing to keep focusing", async () => {
    const { track, applied } = fakeTrack(ANDROID);

    expect(await preferContinuousFocus(track)).toBe(true);
    expect(applied).toEqual([{ focusMode: "continuous" }]);
  });

  it("asks nothing of a camera with no continuous mode", async () => {
    const { track, applied } = fakeTrack({ focusMode: ["manual"] });

    expect(await preferContinuousFocus(track)).toBe(false);
    expect(applied).toEqual([]);
  });

  it("does nothing without a track", async () => {
    expect(await preferContinuousFocus(null)).toBe(false);
  });
});

describe("focusOn", () => {
  // Continuous autofocus stops hunting once it thinks it has a lock, and a
  // phone held over a packet is exactly where it locks on the wrong plane.
  // Asking for a fresh pass without saying where to look, as the old code did,
  // let it settle on the background again.
  it("tells the camera where in its own picture to look", async () => {
    const { track, applied } = fakeTrack(ANDROID);

    expect(await focusOn(track, { x: 0.4, y: 0.6 })).toBe(true);
    expect(applied).toEqual([
      { pointsOfInterest: [{ x: 0.4, y: 0.6 }], focusMode: "single-shot" },
    ]);
  });

  it("still kicks the focus on a camera that cannot take a point", async () => {
    const { track, applied } = fakeTrack({ focusMode: ["continuous", "single-shot"] });

    expect(await focusOn(track, { x: 0.5, y: 0.5 })).toBe(true);
    expect(applied).toEqual([{ focusMode: "single-shot" }]);
  });

  it("asks nothing of a camera that can do neither", async () => {
    const { track, applied } = fakeTrack({ focusMode: ["continuous"] });

    expect(await focusOn(track, { x: 0.5, y: 0.5 })).toBe(false);
    expect(applied).toEqual([]);
  });

  it("does nothing without a track", async () => {
    expect(await focusOn(null, { x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe("applyZoom and setTorch", () => {
  it("passes the zoom and the light through to the camera", async () => {
    const { track, applied } = fakeTrack(ANDROID);

    await applyZoom(track, 2);
    await setTorch(track, true);

    expect(applied).toEqual([{ zoom: 2 }, { torch: true }]);
  });

  // These controls are uneven across Android and absent on iOS. A refusal has
  // to leave a working stream, not break the scan.
  it("reports a refusal instead of throwing", async () => {
    const { track } = fakeTrack(ANDROID, { refuses: true });

    expect(await applyZoom(track, 2)).toBe(false);
    expect(await setTorch(track, true)).toBe(false);
    expect(await preferContinuousFocus(track)).toBe(false);
    expect(await focusOn(track, { x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe("videoTrack", () => {
  it("finds the camera track hanging off the video element", () => {
    const track = {} as MediaStreamTrack;
    const video = {
      srcObject: { getVideoTracks: () => [track] } as unknown as MediaStream,
    } as HTMLVideoElement;

    expect(videoTrack(video)).toBe(track);
  });

  it("gives nothing back before the stream is attached", () => {
    expect(videoTrack(null)).toBeNull();
    expect(videoTrack({ srcObject: null } as HTMLVideoElement)).toBeNull();
  });

  it("gives nothing back for a stream with no video in it", () => {
    const video = {
      srcObject: { getVideoTracks: () => [] } as unknown as MediaStream,
    } as HTMLVideoElement;

    expect(videoTrack(video)).toBeNull();
  });
});
