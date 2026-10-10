"use client";

import { useRef, useState } from "react";
import { Download, FileUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import type { BackupCounts } from "@/lib/backup/vyro";

type Preview = { gym: string; createdAt: string; counts: BackupCounts };
const labels: Array<[keyof BackupCounts, string]> = [
  ["members", "Members"], ["plans", "Plans"], ["memberships", "Memberships"],
  ["payments", "Payments"], ["attendance", "Attendance"], ["trainers", "Trainers"],
  ["expenses", "Expenses"], ["photos", "Photos"],
];

export function BackupManager() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "restore" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendBackup(mode: "preview" | "restore") {
    if (!file || busy) return;
    setBusy(mode); setError(""); setMessage("");
    try {
      const response = await fetch(`/gym/backup/restore${mode === "preview" ? "?preview=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/vnd.vyro.backup" },
        body: file,
      });
      const result = await response.json() as { error?: string; success?: boolean; gym?: string; createdAt?: string; counts?: BackupCounts; restored?: unknown; photos?: number };
      if (!response.ok) throw new Error(result.error ?? "Backup operation failed.");
      if (mode === "preview" && result.counts && result.gym && result.createdAt) {
        setPreview({ gym: result.gym, createdAt: result.createdAt, counts: result.counts });
        setMessage("Backup passed file, integrity, and gym checks. No data has been changed.");
      } else {
        setPreview(null); setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setMessage("Backup restored successfully. Your gym records and private photos are ready.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Backup operation failed.");
      if (mode === "preview") setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  function selectFile(next: File | null) {
    setFile(next); setPreview(null); setError(""); setMessage("");
    if (next && !next.name.toLowerCase().endsWith(".vyro")) setError("Choose a .vyro backup file.");
  }

  return (
    <div className="space-y-6">
      <CommandCenterCard title="Create a VYRO backup">
        <p className="text-sm leading-6 text-muted-foreground">Download one private .vyro file containing your gym settings, current members, plan and payment history, attendance, trainers, expenses, notification preferences, and private photos.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild><a href="/gym/backup/export"><Download/>Create Backup</a></Button>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-md border border-border/70 bg-background/30 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success"/>Only this gym’s non-archived operational records are included. Photos remain private and no login credentials are included.</p>
      </CommandCenterCard>

      <CommandCenterCard title="Import a VYRO backup">
        <p className="text-sm leading-6 text-muted-foreground">Choose a backup created for this gym. VYRO checks its version, integrity, records, references, photos, and gym identity before offering a restore.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input ref={inputRef} type="file" accept=".vyro,application/vnd.vyro.backup" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground" />
          <Button type="button" variant="secondary" disabled={!file || Boolean(error) || Boolean(busy)} onClick={() => void sendBackup("preview")}>
            {busy === "preview" ? <LoaderCircle className="animate-spin"/> : <FileUp/>} Validate & Preview
          </Button>
        </div>
        {preview && <div className="mt-5 rounded-lg border border-border/70 bg-background/30 p-4">
          <p className="font-medium">Restore preview for {preview.gym}</p>
          <p className="mt-1 text-xs text-muted-foreground">Created {new Date(preview.createdAt).toLocaleString()}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {labels.map(([key, label]) => <div key={key} className="rounded-md border border-border/60 px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{preview.counts[key]}</dd></div>)}
          </dl>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-warning">Restore adds the records in this backup and restores the gym settings from that date. Existing conflicting records stop the complete restore.</p>
            <Button type="button" disabled={Boolean(busy)} onClick={() => {
              if (window.confirm("Restore this VYRO backup? The operation adds its records and restores gym settings. A conflict will cancel all database changes.")) void sendBackup("restore");
            }}>{busy === "restore" ? <LoaderCircle className="animate-spin"/> : <FileUp/>} Restore</Button>
          </div>
        </div>}
        {message && <p role="status" className="mt-4 text-sm text-success">{message}</p>}
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      </CommandCenterCard>
    </div>
  );
}
