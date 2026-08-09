"use client";

import { useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import {
  uploadCheckInPhoto,
  deleteCheckInPhoto,
} from "./actions";
import type { PhotoAngle } from "@/lib/types";

interface Photo {
  id: string;
  angle: PhotoAngle;
  signed_url: string | undefined;
}

const ANGLES: { key: PhotoAngle; label: string }[] = [
  { key: "front", label: "Front" },
  { key: "side", label: "Side" },
  { key: "back", label: "Back" },
];

// Optional progress photos for a saved check-in. Private by default: each file
// goes to the private bucket and is shown through a short-lived signed URL. The
// user can add one per angle (plus extras) and delete any of them.
export default function PhotoUploader({ checkInId }: { checkInId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState<PhotoAngle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<PhotoAngle>("other");
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(angle: PhotoAngle) {
    pending.current = angle;
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!file) return;
    const angle = pending.current;
    setBusy(angle);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("checkInId", checkInId);
      fd.set("angle", angle);
      const res = await uploadCheckInPhoto(fd);
      setPhotos((p) => [...p, { id: res.id, angle: res.angle, signed_url: res.signed_url }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the photo.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setPhotos((p) => p.filter((x) => x.id !== id));
    try {
      await deleteCheckInPhoto(id);
    } catch {
      // Best-effort: the row may already be gone; nothing to surface.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Progress photos
        </h3>
        <span className="text-xs text-[var(--muted)]">Private, only you</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        className="hidden"
      />

      <div className="grid grid-cols-3 gap-3">
        {ANGLES.map((a) => {
          const shot = photos.find((p) => p.angle === a.key);
          if (shot) {
            return (
              <PhotoTile
                key={a.key}
                label={a.label}
                url={shot.signed_url}
                onDelete={() => remove(shot.id)}
              />
            );
          }
          return (
            <button
              key={a.key}
              onClick={() => pick(a.key)}
              disabled={busy !== null}
              className="grid aspect-square place-items-center gap-1 rounded-2xl border border-dashed border-[var(--border)] text-[var(--muted)] active:scale-95 disabled:opacity-50"
            >
              {busy === a.key ? (
                <Loader2 size={22} className="animate-spin" />
              ) : (
                <Camera size={22} />
              )}
              <span className="text-xs font-semibold">{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Any extra photos beyond the three angles. */}
      {photos.filter((p) => p.angle === "other").length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {photos
            .filter((p) => p.angle === "other")
            .map((p) => (
              <PhotoTile
                key={p.id}
                label="Extra"
                url={p.signed_url}
                onDelete={() => remove(p.id)}
              />
            ))}
        </div>
      )}

      <button
        onClick={() => pick("other")}
        disabled={busy !== null}
        className="sc-btn sc-btn-neutral w-full disabled:opacity-50"
      >
        <Camera size={16} /> Add another photo
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function PhotoTile({
  label,
  url,
  onDelete,
}: {
  label: string;
  url: string | undefined;
  onDelete: () => void;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--fill)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-xs text-[var(--muted)]">
          {label}
        </div>
      )}
      <button
        onClick={onDelete}
        aria-label={`Delete ${label} photo`}
        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white active:scale-90"
      >
        <X size={15} />
      </button>
      <span className="absolute bottom-1 left-2 text-xs font-semibold text-white drop-shadow">
        {label}
      </span>
    </div>
  );
}
