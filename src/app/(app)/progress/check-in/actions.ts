"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getTimezone } from "@/lib/queries";
import { localWeekStart } from "@/lib/time";
import {
  measurementCmSchema,
  parseOrThrow,
  weightKgSchema,
} from "@/lib/validate";
import type { CheckInMeasurements, PhotoAngle } from "@/lib/types";

const PHOTO_BUCKET = "check-in-photos";
const MAX_NOTE_CHARS = 500;
const MEASUREMENT_KEYS = [
  "chest_cm",
  "waist_cm",
  "arms_cm",
  "thighs_cm",
  "hips_cm",
] as const;

export interface CheckInInput extends CheckInMeasurements {
  weight_kg: number | null;
  note: string | null;
}

// One line of the "vs last check-in" summary: a measurement (or weight) that
// both this check-in and the previous one have, and how it moved. delta is
// this − previous, so negative means shrinking (the win for waist/weight).
export interface CheckInDelta {
  key: string;
  label: string;
  unit: string;
  delta: number;
}

export interface SaveCheckInResult {
  checkInId: string;
  weekStart: string;
  deltas: CheckInDelta[];
}

const LABELS: Record<string, string> = {
  weight_kg: "Weight",
  chest_cm: "Chest",
  waist_cm: "Waist",
  arms_cm: "Arms",
  thighs_cm: "Thighs",
  hips_cm: "Hips",
};

// Save (or overwrite) this week's check-in, then return the deltas against the
// previous check-in so the confirmation screen can say "waist −2cm". One row per
// user per week (upsert on user_id, week_start).
export async function saveCheckIn(
  input: CheckInInput,
): Promise<SaveCheckInResult> {
  const { supabase, user } = await requireUser();
  const tz = await getTimezone();
  const weekStart = localWeekStart(tz);

  // Validate every number before it lands: a junk waist or weight would drag the
  // coach's read of fat loss and the trailing average.
  const measurements = Object.fromEntries(
    MEASUREMENT_KEYS.map((k) => [
      k,
      input[k] == null ? null : parseOrThrow(measurementCmSchema, input[k], LABELS[k]),
    ]),
  ) as unknown as CheckInMeasurements;

  const weight_kg =
    input.weight_kg == null
      ? null
      : parseOrThrow(weightKgSchema, input.weight_kg, "Weight");

  const note = input.note?.trim() ? input.note.trim().slice(0, MAX_NOTE_CHARS) : null;

  const { data, error } = await supabase
    .from("check_ins")
    .upsert(
      { user_id: user.id, week_start: weekStart, ...measurements, weight_kg, note },
      { onConflict: "user_id,week_start" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // The baseline for the deltas: the most recent check-in of an earlier week.
  const { data: prevData } = await supabase
    .from("check_ins")
    .select("weight_kg, chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm")
    .lt("week_start", weekStart)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  const deltas: CheckInDelta[] = [];
  if (prevData) {
    const prev = prevData as Record<string, unknown>;
    const now: Record<string, number | null> = { weight_kg, ...measurements };
    for (const key of ["weight_kg", ...MEASUREMENT_KEYS]) {
      const a = now[key];
      const b = prev[key] == null ? null : Number(prev[key]);
      if (a != null && b != null) {
        const delta = Math.round((a - b) * 10) / 10;
        deltas.push({
          key,
          label: LABELS[key],
          unit: key === "weight_kg" ? "kg" : "cm",
          delta,
        });
      }
    }
  }

  revalidatePath("/progress");
  return { checkInId: data.id as string, weekStart, deltas };
}

// Upload one progress photo to the private bucket and record it. Files live under
// <user_id>/<check_in_id>/<uuid> so the storage policies (0029) gate on the owner
// folder. Returns the new row's id and a signed URL to show it straight away.
export async function uploadCheckInPhoto(
  formData: FormData,
): Promise<{ id: string; signed_url: string | undefined; angle: PhotoAngle }> {
  const { supabase, user } = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No photo to upload.");
  }
  const checkInId = String(formData.get("checkInId") ?? "");
  if (!checkInId) throw new Error("Missing check-in.");
  const rawAngle = String(formData.get("angle") ?? "other");
  const angle: PhotoAngle = (["front", "side", "back", "other"] as const).includes(
    rawAngle as PhotoAngle,
  )
    ? (rawAngle as PhotoAngle)
    : "other";

  // Only treat text after a real dot as an extension — a dotless name like
  // "photo" must not become an extension of "photo".
  const dot = file.name.lastIndexOf(".");
  const ext =
    (dot >= 0 ? file.name.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "jpg";
  const path = `${user.id}/${checkInId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase
    .from("check_in_photos")
    .insert({ check_in_id: checkInId, user_id: user.id, storage_path: path, angle })
    .select("id")
    .single();
  if (error) {
    // Don't orphan the file if the row insert fails.
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(error.message);
  }

  const { data: signed } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);

  revalidatePath("/progress");
  return { id: data.id as string, signed_url: signed?.signedUrl, angle };
}

// Delete one photo: its storage object and its row. RLS + the storage policies
// keep this to the owner's own files.
export async function deleteCheckInPhoto(id: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("check_in_photos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();
  const path = (data as { storage_path: string } | null)?.storage_path;
  if (path) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  }
  const { error } = await supabase.from("check_in_photos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}

// Delete a whole check-in — its photos' storage objects, then the row (which
// cascades to the photo rows).
export async function deleteCheckIn(id: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data } = await supabase
    .from("check_in_photos")
    .select("storage_path")
    .eq("check_in_id", id);
  const paths = ((data as { storage_path: string }[] | null) ?? []).map(
    (r) => r.storage_path,
  );
  if (paths.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  }

  const { error } = await supabase.from("check_ins").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/progress");
}
