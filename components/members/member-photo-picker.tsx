"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, ImagePlus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberPhotoViewer } from "@/components/members/member-photo-viewer";
import { memberPhotoInputError } from "@/lib/validation/member-photo";

type SelectedPhoto = { file: File; url: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "V";
}

export function MemberPhotoPicker({
  memberName,
  initialPhotoUrl = null,
}: {
  memberName: string;
  initialPhotoUrl?: string | null;
}) {
  const id = useId();
  const [selected, setSelected] = useState<SelectedPhoto | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const source = selected?.url ?? (removed ? null : initialPhotoUrl);

  useEffect(() => () => {
    if (selected?.url) URL.revokeObjectURL(selected.url);
  }, [selected?.url]);

  function onFileChange(input: HTMLInputElement, otherInput: HTMLInputElement | null) {
    const file = input.files?.[0];
    if (!file) return;
    if (otherInput) otherInput.value = "";
    setRemoved(false);
    const inputError = memberPhotoInputError(file);
    setError(inputError);
    if (selected?.url) URL.revokeObjectURL(selected.url);
    setSelected(inputError ? null : { file, url: URL.createObjectURL(file) });
  }

  function clearSelection() {
    if (uploadInput.current) uploadInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    if (selected?.url) URL.revokeObjectURL(selected.url);
    setSelected(null);
    setError(null);
  }

  function removePhoto() {
    if (selected) {
      clearSelection();
      return;
    }
    if (initialPhotoUrl) setRemoved((value) => !value);
  }

  return (
    <section className="space-y-3" aria-label="Member photo">
      <input type="hidden" name="photo_action" value={removed ? "remove" : selected ? "replace" : "keep"} />
      <div className="flex flex-wrap items-center gap-4">
        {source ? (
          <MemberPhotoViewer
            src={source}
            alt={`${memberName} photo`}
            triggerClassName="h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-elevated text-xl font-semibold text-muted-foreground transition hover:border-accent sm:h-28 sm:w-28"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={source} alt="" className="h-full w-full object-cover" />
          </MemberPhotoViewer>
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-elevated text-xl font-semibold text-muted-foreground sm:h-28 sm:w-28">
            <span aria-label="VYRO avatar fallback">{initials(memberName)}</span>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="font-display text-sm font-semibold">Photo <span className="font-sans font-normal text-muted-foreground">(optional)</span></h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">JPG, JPEG, or PNG · up to 5 MB. Leave unchanged to keep the current photo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" size="sm" variant="secondary">
              <label htmlFor={`${id}-upload`}><ImagePlus aria-hidden="true" />Upload photo</label>
            </Button>
            <input
              ref={uploadInput}
              id={`${id}-upload`}
              className="sr-only"
              type="file"
              name="photo"
              accept="image/jpeg,image/png"
              onChange={(event) => onFileChange(event.currentTarget, cameraInput.current)}
              aria-label="Upload member photo"
            />
            <Button asChild type="button" size="sm" variant="secondary">
              <label htmlFor={`${id}-camera`}><Camera aria-hidden="true" />Take photo</label>
            </Button>
            <input
              ref={cameraInput}
              id={`${id}-camera`}
              className="sr-only"
              type="file"
              name="camera_photo"
              accept="image/jpeg,image/png"
              capture="environment"
              onChange={(event) => onFileChange(event.currentTarget, uploadInput.current)}
              aria-label="Take member photo with camera"
            />
            {selected || initialPhotoUrl ? (
              <Button type="button" size="sm" variant="ghost" onClick={removePhoto}>
                {selected ? <RotateCcw aria-hidden="true" /> : removed ? <RotateCcw aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                {selected ? "Clear selection" : removed ? "Keep photo" : "Remove photo"}
              </Button>
            ) : null}
          </div>
          {removed ? <p className="text-xs text-warning">This photo will be removed when you save.</p> : null}
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}
