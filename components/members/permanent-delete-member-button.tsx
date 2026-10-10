"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { permanentlyDeleteArchivedMemberAction } from "@/app/(gym)/gym/members/actions";
import { Button } from "@/components/ui/button";
export function PermanentDeleteMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
 const [pending, startTransition] = useTransition(); const [error, setError] = useState(""); const router = useRouter();
 function confirmDelete() { const typed = window.prompt(`Permanently delete ${memberName} and their membership, payment, attendance, and photo records?\n\nType DELETE to confirm.`); if (typed !== "DELETE") return;
  setError(""); startTransition(async () => { const result = await permanentlyDeleteArchivedMemberAction(memberId); if (result.status === "success") { router.replace("/gym/members?member_status=archived"); router.refresh(); } else setError(result.message); });
 }
 return <div><Button type="button" variant="destructive" disabled={pending} onClick={confirmDelete}>{pending ? "Deleting…" : "Permanently delete member"}</Button>{error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}</div>;
}
