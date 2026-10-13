"use client";

import { useActionState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { generateGymCheckinCodesAction } from "@/app/(gym)/gym/attendance/qr-actions";
import { Button } from "@/components/ui/button";

const initialState = { status: "idle" as const, message: "" };
const permanentOrigin = "https://vyro-2-two.vercel.app";

export function GymCheckinQrManager({ gymId, gymName, activeMembers, assignedCodes, codesReady }: {
  gymId: string;
  gymName: string;
  activeMembers: number;
  assignedCodes: number;
  codesReady: boolean;
}) {
  const [state, action, pending] = useActionState(generateGymCheckinCodesAction, initialState);
  const checkInUrl = `${permanentOrigin}/check-in/${gymId}`;

  function downloadQr() {
    const svg = document.querySelector<SVGSVGElement>("[data-gym-checkin-qr] svg");
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vyro-gym-check-in-qr.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  function printQr() {
    const svg = document.querySelector<SVGSVGElement>("[data-gym-checkin-qr] svg");
    if (!svg) return;
    const printWindow = window.open("", "_blank", "width=520,height=640");
    if (!printWindow) return;
    printWindow.opener = null;
    const markup = new XMLSerializer().serializeToString(svg.cloneNode(true));
    printWindow.document.write(`<!doctype html><html><head><title>${gymName} check-in QR</title><style>body{font:16px Arial,sans-serif;text-align:center;padding:32px;color:#121816}svg{width:min(80vw,360px);height:auto}.url{overflow-wrap:anywhere;font-size:12px;margin-top:18px}</style></head><body><h1>${gymName.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</h1>${markup}<p>Scan with your phone camera, then enter your 4-digit Member ID.</p><p class="url">${checkInUrl}</p><script>window.onload=()=>{window.print();window.close()}</script></body></html>`);
    printWindow.document.close();
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="space-y-4">
        <div>
          <h3 className="font-medium">Permanent gym QR</h3>
          <p className="mt-1 text-sm text-muted-foreground">Members scan this with their phone camera, enter only their four-digit Member ID, and tap Check In.</p>
        </div>
        <p className="break-all rounded-md border border-border/70 bg-background/40 p-3 font-mono text-xs">{checkInUrl}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={downloadQr}>Download QR</Button>
          <Button type="button" variant="secondary" onClick={printQr}>Print QR</Button>
          {codesReady && activeMembers > 0
            ? <a className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted/40" href="/api/gym/check-in-codes">Download member IDs</a>
            : <span className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm text-muted-foreground">Generate IDs to download list</span>}
        </div>
        <div className="rounded-md border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground">
          <p>{assignedCodes} of {activeMembers} active members have an ID.</p>
          <p className="mt-1">Generating IDs only changes members who do not already have one. Codes stay the same afterward.</p>
        </div>
        <form action={action}>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Generating IDs…" : assignedCodes === activeMembers ? "Check for new members" : "Generate four-digit IDs"}
          </Button>
        </form>
        {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm">{state.message}</p> : null}
        <p className="text-xs text-muted-foreground">Codes are unique within this gym. Only gym staff can download the member list.</p>
      </div>
      <div data-gym-checkin-qr className="mx-auto rounded-xl bg-white p-4">
        <QRCodeSVG value={checkInUrl} size={224} level="Q" includeMargin aria-label={`${gymName} permanent check-in QR code`} />
      </div>
    </div>
  );
}
