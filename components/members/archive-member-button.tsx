"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveMemberAction } from "@/app/(gym)/gym/members/actions";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function ArchiveMemberButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function confirmArchive() {
    setError("");
    startTransition(async () => {
      const result = await archiveMemberAction(memberId);
      if (result.status === "success") {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>Remove member</Button>
      {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      <ConfirmationDialog
        open={open}
        title="Archive this member?"
        description="This removes the member from the active directory and prevents new memberships or payments. Existing memberships, payments, attendance, and audit history will be preserved."
        confirmLabel={pending ? "Archiving…" : "Archive member"}
        confirmDisabled={pending}
        onConfirm={confirmArchive}
        onOpenChange={setOpen}
      />
    </>
  );
}
