"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePlanAction } from "@/app/(gym)/gym/plans/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState } from "@/lib/forms";

export type EditablePlan = {
  id: string;
  name: string;
  duration_days: number;
  price: number | string;
  description: string | null;
  is_active: boolean;
};

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? <p id={`${id}-error`} className="text-xs text-danger">{message}</p> : null;
}

export function PlanFormDialog({ plan }: { plan?: EditablePlan }) {
  const [open, setOpen] = useState(false);
  const isEditing = Boolean(plan);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={isEditing ? "secondary" : "default"} size={isEditing ? "sm" : "default"}>
          {isEditing ? "Edit plan" : "Create plan"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit membership plan" : "Create membership plan"}</DialogTitle>
          <DialogDescription>
            Set the plan name, duration, and price. These values are saved for this gym only.
          </DialogDescription>
        </DialogHeader>
        <PlanForm plan={plan} />
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ plan }: { plan?: EditablePlan }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(savePlanAction, initialFormActionState);
  const isEditing = Boolean(plan);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
    }
  }, [router, state]);

  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">{state.message}</p>
        <div className="flex justify-end border-t border-border/70 pt-4">
          <DialogClose asChild><Button type="button">Done</Button></DialogClose>
        </div>
      </div>
    );
  }

  return (
        <form action={formAction} className="space-y-4">
          {plan ? <input type="hidden" name="plan_id" value={plan.id} /> : null}
          {state.status === "error" ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{state.message}</p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`plan-name-${plan?.id ?? "new"}`}>Plan name <span className="text-accent">*</span></Label>
            <Input id={`plan-name-${plan?.id ?? "new"}`} name="name" required maxLength={120} defaultValue={plan?.name ?? ""} aria-invalid={Boolean(state.fieldErrors?.name)} />
            <FieldError id="name" message={state.fieldErrors?.name} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-duration-${plan?.id ?? "new"}`}>Duration (days) <span className="text-accent">*</span></Label>
              <Input id={`plan-duration-${plan?.id ?? "new"}`} name="duration_days" type="number" min="1" step="1" required defaultValue={plan?.duration_days ?? ""} aria-invalid={Boolean(state.fieldErrors?.duration_days)} />
              <FieldError id="duration_days" message={state.fieldErrors?.duration_days} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`plan-price-${plan?.id ?? "new"}`}>Price (₹) <span className="text-accent">*</span></Label>
              <Input id={`plan-price-${plan?.id ?? "new"}`} name="price" type="number" min="0" step="0.01" required defaultValue={plan?.price ?? ""} aria-invalid={Boolean(state.fieldErrors?.price)} />
              <FieldError id="price" message={state.fieldErrors?.price} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`plan-description-${plan?.id ?? "new"}`}>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id={`plan-description-${plan?.id ?? "new"}`} name="description" maxLength={2000} rows={3} defaultValue={plan?.description ?? ""} />
            <FieldError id="description" message={state.fieldErrors?.description} />
          </div>
          <label className="flex items-start gap-3 rounded-md border border-border/80 bg-background/35 p-3">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={plan?.is_active ?? true}
              className="mt-0.5 h-4 w-4 rounded border-border accent-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>
              <span className="block text-sm font-medium">Plan is active</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">Only active plans can be selected for a new member.</span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
            <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEditing ? "Save changes" : "Create plan"}</Button>
          </div>
        </form>
  );
}
