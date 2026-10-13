"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const genericError = "We couldn't check you in. Check your 4-digit Member ID or ask gym staff.";

export function PublicCheckInForm({ gymId }: { gymId: string }) {
  const [memberId, setMemberId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymId, memberId }),
      });
      const result = await response.json() as { ok?: boolean };
      if (!response.ok || !result.ok) {
        setMessage(genericError);
        return;
      }
      setSuccess(true);
      setMessage("You're checked in. Have a great workout.");
      setMemberId("");
    } catch {
      setMessage("Check-in is temporarily unavailable. Please ask gym staff for help.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="public-member-id">4-digit Member ID</Label>
        <Input
          id="public-member-id"
          name="memberId"
          value={memberId}
          onChange={(event) => setMemberId(event.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          autoCapitalize="off"
          pattern="[0-9]{4}"
          maxLength={4}
          placeholder="0000"
          aria-describedby="member-id-help"
          required
          className="h-14 text-center font-mono text-2xl tracking-[0.45em]"
        />
        <p id="member-id-help" className="text-center text-sm text-muted-foreground">No account, password, or PIN needed.</p>
      </div>
      <Button className="h-12 w-full text-base" disabled={pending || memberId.length !== 4}>
        {pending ? "Checking in…" : "Check In"}
      </Button>
      {message ? <p role={success ? "status" : "alert"} className="text-center text-sm">{message}</p> : null}
    </form>
  );
}
