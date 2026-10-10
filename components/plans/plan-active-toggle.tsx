"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlanActiveAction } from "@/app/(gym)/gym/plans/actions";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function PlanActiveToggle({ planId, isActive }: { planId: string; isActive: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function changeStatus(nextActive: boolean) {
    if (pending) return;
    setError("");
    startTransition(async () => {
      const result = await setPlanActiveAction(planId, nextActive);
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
      {isActive ? <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>Deactivate plan</Button>
        : <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => changeStatus(true)}>{pending ? "Activating…" : "Activate plan"}</Button>}
      {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      {isActive ? <ConfirmationDialog
        open={open}
        title="Deactivate this plan?"
        description="This plan will no longer be selectable for new memberships. Existing members keep their saved plan history and price snapshots."
        confirmLabel={pending ? "Deactivating…" : "Deactivate plan"}
        confirmDisabled={pending}
        onConfirm={() => changeStatus(false)}
        onOpenChange={setOpen}
      /> : null}
    </>
  );
}
