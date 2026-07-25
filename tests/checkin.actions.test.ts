import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const {
  saveCheckIn,
  uploadCheckInPhoto,
  deleteCheckInPhoto,
  deleteCheckIn,
} = await import("@/app/(app)/progress/check-in/actions");

const empty = {
  chest_cm: null,
  waist_cm: null,
  arms_cm: null,
  thighs_cm: null,
  hips_cm: null,
  weight_kg: null,
  note: null,
};

describe("saveCheckIn", () => {
  it("saves this week's measurements, weight and note", async () => {
    const { db } = installFakeSupabase({ db: { check_ins: [] } });
    const res = await saveCheckIn({
      ...empty,
      waist_cm: 84,
      hips_cm: 96,
      weight_kg: 79.5,
      note: "  feeling good  ",
    });
    expect(db.check_ins).toHaveLength(1);
    expect(db.check_ins[0].waist_cm).toBe(84);
    expect(db.check_ins[0].weight_kg).toBe(79.5);
    expect(db.check_ins[0].note).toBe("feeling good"); // trimmed
    expect(res.checkInId).toBeTruthy();
  });

  it("returns deltas against the previous check-in", async () => {
    const { db } = installFakeSupabase({
      db: {
        check_ins: [
          {
            id: "prev",
            user_id: "user-1",
            week_start: "2000-01-03",
            waist_cm: 86,
            weight_kg: 81,
          },
        ],
      },
    });
    const res = await saveCheckIn({ ...empty, waist_cm: 84, weight_kg: 79.5 });
    const waist = res.deltas.find((d) => d.key === "waist_cm");
    const weight = res.deltas.find((d) => d.key === "weight_kg");
    expect(waist?.delta).toBe(-2);
    expect(weight?.delta).toBe(-1.5);
    // Two rows now: the previous one and this week's.
    expect(db.check_ins).toHaveLength(2);
  });

  it("has no deltas on the first ever check-in", async () => {
    installFakeSupabase({ db: { check_ins: [] } });
    const res = await saveCheckIn({ ...empty, waist_cm: 84 });
    expect(res.deltas).toHaveLength(0);
  });

  it("overwrites rather than duplicating the same week", async () => {
    const { db } = installFakeSupabase({ db: { check_ins: [] } });
    await saveCheckIn({ ...empty, waist_cm: 84 });
    await saveCheckIn({ ...empty, waist_cm: 83 });
    expect(db.check_ins).toHaveLength(1);
    expect(db.check_ins[0].waist_cm).toBe(83);
  });

  it("rejects a junk measurement or weight", async () => {
    const { db } = installFakeSupabase({ db: { check_ins: [] } });
    await expect(saveCheckIn({ ...empty, waist_cm: Number.NaN })).rejects.toThrow(
      /waist/i,
    );
    await expect(saveCheckIn({ ...empty, weight_kg: 900 })).rejects.toThrow(
      /weight/i,
    );
    expect(db.check_ins).toHaveLength(0);
  });

  it("truncates an over-long note", async () => {
    const { db } = installFakeSupabase({ db: { check_ins: [] } });
    await saveCheckIn({ ...empty, waist_cm: 84, note: "x".repeat(900) });
    expect((db.check_ins[0].note as string).length).toBe(500);
  });
});

describe("check-in photos", () => {
  it("uploads a photo to the private bucket and records it", async () => {
    const { db, storage } = installFakeSupabase({
      db: { check_in_photos: [] },
    });
    const fd = new FormData();
    fd.set("file", new File(["x"], "front.jpg", { type: "image/jpeg" }));
    fd.set("checkInId", "ci-1");
    fd.set("angle", "front");

    const res = await uploadCheckInPhoto(fd);
    expect(db.check_in_photos).toHaveLength(1);
    expect(db.check_in_photos[0].angle).toBe("front");
    // Path is scoped to the owner's folder, in the private bucket.
    expect(storage.uploaded[0].bucket).toBe("check-in-photos");
    expect(storage.uploaded[0].path.startsWith("user-1/ci-1/")).toBe(true);
    expect(res.signed_url).toContain("signed:");
  });

  it("rejects an empty upload", async () => {
    installFakeSupabase({ db: { check_in_photos: [] } });
    const fd = new FormData();
    fd.set("file", new File([], "empty.jpg", { type: "image/jpeg" }));
    fd.set("checkInId", "ci-1");
    await expect(uploadCheckInPhoto(fd)).rejects.toThrow(/no photo/i);
  });

  it("rejects an upload with no check-in id", async () => {
    installFakeSupabase({ db: { check_in_photos: [] } });
    const fd = new FormData();
    fd.set("file", new File(["x"], "front.jpg", { type: "image/jpeg" }));
    await expect(uploadCheckInPhoto(fd)).rejects.toThrow(/check-in/i);
  });

  it("falls back to a safe angle and extension", async () => {
    const { db } = installFakeSupabase({ db: { check_in_photos: [] } });
    const fd = new FormData();
    // No extension in the name, and an angle that isn't one of the known ones.
    fd.set("file", new File(["x"], "noext", { type: "image/jpeg" }));
    fd.set("checkInId", "ci-1");
    fd.set("angle", "sideways");
    const res = await uploadCheckInPhoto(fd);
    expect(res.angle).toBe("other");
    expect(db.check_in_photos[0].storage_path).toMatch(/\.jpg$/);
  });

  it("deletes a photo's row and its storage object", async () => {
    const { db, storage } = installFakeSupabase({
      db: {
        check_in_photos: [
          { id: "p1", user_id: "user-1", storage_path: "user-1/ci-1/a.jpg" },
        ],
      },
    });
    await deleteCheckInPhoto("p1");
    expect(db.check_in_photos).toHaveLength(0);
    expect(storage.removed[0].paths).toEqual(["user-1/ci-1/a.jpg"]);
  });
});

describe("deleteCheckIn", () => {
  it("removes the check-in and its photos' files", async () => {
    const { db, storage } = installFakeSupabase({
      db: {
        check_ins: [{ id: "ci-1", user_id: "user-1", week_start: "2026-07-20" }],
        check_in_photos: [
          { id: "p1", check_in_id: "ci-1", user_id: "user-1", storage_path: "user-1/ci-1/a.jpg" },
        ],
      },
    });
    await deleteCheckIn("ci-1");
    expect(db.check_ins).toHaveLength(0);
    expect(storage.removed[0].paths).toEqual(["user-1/ci-1/a.jpg"]);
  });
});
