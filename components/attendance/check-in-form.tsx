"use client";
import { useActionState, useRef, useState } from "react";
import { checkInMemberAction } from "@/app/(gym)/gym/attendance/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
const initial = { status: "idle" as const, message: "" };
export function CheckInForm() {
 const [state, action, pending] = useActionState(checkInMemberAction, initial); const [scanMessage, setScanMessage] = useState(""); const [scanning, setScanning] = useState(false);
 const codeRef = useRef<HTMLInputElement>(null); const formRef = useRef<HTMLFormElement>(null); const videoRef = useRef<HTMLVideoElement>(null);
 async function scanQr() {
  setScanMessage("");
  const api = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (video: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
  if (!api || !navigator.mediaDevices?.getUserMedia) { setScanMessage("QR scanning is not available in this browser. Enter the member code manually."); return; }
  setScanning(true);
  try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); const video = videoRef.current; if (!video) { stream.getTracks().forEach((t) => t.stop()); return; } video.srcObject = stream; await video.play(); const detector = new api({ formats: ["qr_code"] });
   const loop = async () => { if (!videoRef.current || !stream.active) return; const codes = await detector.detect(video); if (codes[0]?.rawValue) { codeRef.current!.value = codes[0].rawValue.trim(); setScanning(false); stream.getTracks().forEach((t) => t.stop()); formRef.current?.requestSubmit(); return; } requestAnimationFrame(() => void loop()); }; void loop();
  } catch { setScanning(false); setScanMessage("Camera access failed. Check browser permission or enter the member code manually."); }
 }
 return <div className="space-y-3"><form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]"><div><Label htmlFor="checkin-code">Member ID / QR code</Label><Input ref={codeRef} id="checkin-code" name="member_code" autoComplete="off" placeholder="VY-…" required/></div><div><Label htmlFor="checkin-notes">Note (optional)</Label><Input id="checkin-notes" name="notes" maxLength={500}/></div><div className="flex items-end"><Button type="button" variant="secondary" onClick={() => void scanQr()} disabled={scanning}>{scanning ? "Scanning…" : "Scan QR"}</Button></div><div className="flex items-end"><Button disabled={pending}>{pending ? "Checking in…" : "Check in"}</Button></div>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className="sm:col-span-4 text-sm">{state.message}</p> : null}{scanMessage ? <p role="status" className="sm:col-span-4 text-sm text-muted-foreground">{scanMessage}</p> : null}</form>{scanning ? <video ref={videoRef} muted playsInline className="max-h-64 w-full rounded-md border border-border bg-black object-cover" aria-label="QR code camera preview"/> : null}</div>;
}
