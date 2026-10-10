"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { assignMembershipAndRecordPaymentAction, recordMemberPaymentAction } from "@/app/(gym)/gym/members/finance-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState } from "@/lib/forms";
import { addDaysToIsoDate, parseMembershipPlanPrice } from "@/lib/validation/member-finance";

export type MembershipPlanOption = {
  id: string;
  name: string;
  duration_days: number;
  price: number | string;
};

export type MemberMembershipOption = {
  id: string;
  membership_plan_id: string;
  plan_name_snapshot: string;
  duration_days_snapshot: number;
  price_snapshot: number | string;
  start_date: string;
  end_date: string;
  status: string;
};

function defaultMembershipStartDate(mode: "assign" | "renew" | "change", today: string, latestMembership: MemberMembershipOption | null) {
  if (mode !== "assign" && latestMembership && latestMembership.end_date >= today) {
    return addDaysToIsoDate(latestMembership.end_date, 1);
  }
  return today;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={`${id}-error`} className="text-xs text-danger">{message}</p> : null;
}

function MembershipDialog({
  mode,
  memberId,
  joiningDate,
  today,
  latestMembership,
  plans,
}: {
  mode: "assign" | "renew" | "change";
  memberId: string;
  joiningDate: string;
  today: string;
  latestMembership: MemberMembershipOption | null;
  plans: MembershipPlanOption[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const title = mode === "renew" ? "Renew membership" : mode === "change" ? "Change plan" : "Assign membership";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={mode === "change" ? "secondary" : "default"} disabled={plans.length === 0}>
          {mode === "renew" ? "Renew" : mode === "change" ? "Change plan" : "Assign membership"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a plan and start date, then record the payment in one step. The saved plan price and duration are used.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <MembershipForm
            key={`${memberId}-${mode}`}
            mode={mode}
            memberId={memberId}
            joiningDate={joiningDate}
            today={today}
            latestMembership={latestMembership}
            plans={plans}
            onSuccess={close}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MembershipForm({
  mode,
  memberId,
  joiningDate,
  today,
  latestMembership,
  plans,
  onSuccess,
}: {
  mode: "assign" | "renew" | "change";
  memberId: string;
  joiningDate: string;
  today: string;
  latestMembership: MemberMembershipOption | null;
  plans: MembershipPlanOption[];
  onSuccess: () => void;
}) {
  const router = useRouter();
  const action = assignMembershipAndRecordPaymentAction.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, initialFormActionState);
  const preferredPlanId = latestMembership?.membership_plan_id && plans.some((plan) => plan.id === latestMembership.membership_plan_id)
    ? latestMembership.membership_plan_id
    : plans[0]?.id ?? "";
  const [planId, setPlanId] = useState(preferredPlanId);
  const [paymentAmount, setPaymentAmount] = useState(() => String(plans.find((plan) => plan.id === preferredPlanId)?.price ?? "0"));
  const [startDate, setStartDate] = useState(() => {
    const suggested = defaultMembershipStartDate(mode, today, latestMembership);
    return suggested < joiningDate ? joiningDate : suggested;
  });
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedPrice = parseMembershipPlanPrice(selectedPlan?.price);
  const isFreePlan = selectedPrice === 0;
  const numericPayment = Number(paymentAmount || 0);
  const paymentAmountValid = paymentAmount.trim() !== "" && Number.isFinite(numericPayment) && numericPayment >= 0 && selectedPrice !== null && numericPayment <= selectedPrice;
  const remaining = Math.max(0, (selectedPrice ?? 0) - (Number.isFinite(numericPayment) ? numericPayment : 0));
  const endDate = selectedPlan ? addDaysToIsoDate(startDate, selectedPlan.duration_days) : "";

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
      onSuccess();
    }
  }, [onSuccess, router, state]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" ? (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <p>{state.message}</p>
          {state.recordId ? <a className="mt-2 inline-block font-semibold underline" href={`/gym/members/${state.recordId}`}>Open member profile</a> : null}
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`membership-plan-${mode}`}>Plan <span className="text-accent">*</span></Label>
        <Select name="membership_plan_id" value={planId} onValueChange={(nextPlanId) => {
          setPlanId(nextPlanId);
          const nextPlan = plans.find((plan) => plan.id === nextPlanId);
          setPaymentAmount(String(nextPlan?.price ?? "0"));
        }} required>
          <SelectTrigger id={`membership-plan-${mode}`} aria-invalid={Boolean(state.fieldErrors?.membership_plan_id)}>
            <SelectValue placeholder="Select an active plan" />
          </SelectTrigger>
          <SelectContent>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>{plan.name} · {plan.duration_days} days</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`membership-plan-${mode}`} message={state.fieldErrors?.membership_plan_id} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`membership-start-${mode}`}>Start date <span className="text-accent">*</span></Label>
          <Input
            id={`membership-start-${mode}`}
            name="start_date"
            type="date"
            min={joiningDate}
            value={startDate}
            onChange={(event) => setStartDate(event.currentTarget.value)}
            required
            aria-invalid={Boolean(state.fieldErrors?.start_date)}
          />
          <FieldError id={`membership-start-${mode}`} message={state.fieldErrors?.start_date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`membership-end-${mode}`}>End date</Label>
          <Input id={`membership-end-${mode}`} type="date" value={endDate} readOnly aria-readonly="true" />
          <p className="text-xs text-muted-foreground">{selectedPlan ? `${selectedPlan.duration_days} days` : "Choose a plan to see duration."}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border/70 bg-background/35 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Membership price</p><p className="mt-1 font-semibold tabular-nums">{selectedPrice === null ? "—" : `₹${selectedPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p></div>
        <div className="grid gap-1.5"><Label htmlFor={`membership-payment-amount-${mode}`}>Payment today (₹)</Label><Input id={`membership-payment-amount-${mode}`} name="payment_amount" type="number" min="0" max={selectedPrice ?? undefined} step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.currentTarget.value)} required aria-invalid={Boolean(state.fieldErrors?.payment_amount) || !paymentAmountValid} /><FieldError id={`membership-payment-amount-${mode}`} message={state.fieldErrors?.payment_amount} />{!paymentAmountValid ? <p className="text-xs text-danger">Payment cannot exceed the membership price.</p> : null}</div>
        <div className="rounded-md border border-border/70 bg-background/35 p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p><p className="mt-1 font-semibold tabular-nums">{`₹${remaining.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</p></div>
      </div>
      {isFreePlan ? <p className="text-xs text-muted-foreground">This plan has no balance. No payment row will be created.</p> : null}
      {selectedPlan && selectedPrice === null ? <p role="alert" className="text-xs text-danger">This plan price is invalid. Choose another plan or correct its saved price.</p> : null}
      {numericPayment > 0 ? <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`membership-payment-method-${mode}`}>Payment method <span className="text-accent">*</span></Label>
          <select id={`membership-payment-method-${mode}`} name="payment_method" defaultValue="cash" required className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25" aria-invalid={Boolean(state.fieldErrors?.payment_method)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <FieldError id={`membership-payment-method-${mode}`} message={state.fieldErrors?.payment_method} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`membership-payment-date-${mode}`}>Payment date <span className="text-accent">*</span></Label>
          <Input id={`membership-payment-date-${mode}`} name="payment_date" type="date" max={today} defaultValue={today} required aria-invalid={Boolean(state.fieldErrors?.payment_date)} />
          <FieldError id={`membership-payment-date-${mode}`} message={state.fieldErrors?.payment_date} />
        </div>
      <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`membership-payment-reference-${mode}`}>Reference <span className="text-muted-foreground">(optional)</span></Label>
          <Input id={`membership-payment-reference-${mode}`} name="reference" maxLength={120} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`membership-payment-notes-${mode}`}>Notes <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id={`membership-payment-notes-${mode}`} name="notes" rows={2} maxLength={500} />
        </div>
      </div>
      </> : <p className="text-sm text-muted-foreground">No payment will be recorded today. You can collect the balance later.</p>}
      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onSuccess}>Cancel</Button>
        <Button type="submit" disabled={pending || Boolean(state.recordId) || !selectedPlan || selectedPrice === null || !paymentAmountValid}>
          {pending ? "Saving…" : numericPayment === 0 ? (mode === "renew" ? "Renew & Pay Later" : mode === "change" ? "Change Plan & Pay Later" : "Assign & Pay Later") : mode === "renew" ? "Renew & Record Payment" : mode === "change" ? "Change Plan & Record Payment" : "Assign & Record Payment"}
        </Button>
      </div>
    </form>
  );
}

export function MembershipActions({
  memberId,
  joiningDate,
  today,
  latestMembership,
  hasMembershipHistory,
  hasCurrentOrUpcomingMembership,
  plans,
}: {
  memberId: string;
  joiningDate: string;
  today: string;
  latestMembership: MemberMembershipOption | null;
  hasMembershipHistory: boolean;
  hasCurrentOrUpcomingMembership: boolean;
  plans: MembershipPlanOption[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <MembershipDialog
        mode={hasMembershipHistory ? "renew" : "assign"}
        memberId={memberId}
        joiningDate={joiningDate}
        today={today}
        latestMembership={latestMembership}
        plans={plans}
      />
      {hasMembershipHistory && hasCurrentOrUpcomingMembership ? (
        <MembershipDialog mode="change" memberId={memberId} joiningDate={joiningDate} today={today} latestMembership={latestMembership} plans={plans} />
      ) : null}
    </div>
  );
}

export function RecordPaymentDialog({ memberId, membershipId, outstanding, currency, today }: { memberId: string; membershipId: string; outstanding: number; currency: string; today: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="secondary" disabled={outstanding <= 0}>Record payment</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Outstanding balance: {new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(outstanding)}. This payment will be applied to the selected membership.</DialogDescription>
        </DialogHeader>
        {open ? <PaymentForm key={`${memberId}-${membershipId}`} memberId={memberId} membershipId={membershipId} outstanding={outstanding} today={today} onSuccess={close} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({ memberId, membershipId, outstanding, today, onSuccess }: { memberId: string; membershipId: string; outstanding: number; today: string; onSuccess: () => void }) {
  const router = useRouter();
  const action = recordMemberPaymentAction.bind(null, memberId, membershipId);
  const [state, formAction, pending] = useActionState(action, initialFormActionState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message);
      router.refresh();
      onSuccess();
    }
  }, [onSuccess, router, state]);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">{state.message}</p>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="member-payment-amount">Amount (₹) <span className="text-accent">*</span></Label>
        <Input id="member-payment-amount" name="amount" type="number" min="0.01" max={outstanding} step="0.01" inputMode="decimal" defaultValue={outstanding.toFixed(2)} required aria-invalid={Boolean(state.fieldErrors?.amount)} />
        <FieldError id="member-payment-amount" message={state.fieldErrors?.amount} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="member-payment-date">Payment date <span className="text-accent">*</span></Label>
          <Input id="member-payment-date" name="payment_date" type="date" max={today} defaultValue={today} required aria-invalid={Boolean(state.fieldErrors?.payment_date)} />
          <FieldError id="member-payment-date" message={state.fieldErrors?.payment_date} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="member-payment-method">Payment method <span className="text-accent">*</span></Label>
          <select id="member-payment-method" name="payment_method" defaultValue="cash" required className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25" aria-invalid={Boolean(state.fieldErrors?.payment_method)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
          <FieldError id="member-payment-method" message={state.fieldErrors?.payment_method} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="member-payment-reference">Reference <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="member-payment-reference" name="reference" maxLength={120} aria-invalid={Boolean(state.fieldErrors?.reference)} />
        <FieldError id="member-payment-reference" message={state.fieldErrors?.reference} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="member-payment-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea id="member-payment-notes" name="notes" rows={3} maxLength={500} aria-invalid={Boolean(state.fieldErrors?.notes)} />
        <FieldError id="member-payment-notes" message={state.fieldErrors?.notes} />
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onSuccess}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Recording…" : "Record payment"}</Button>
      </div>
    </form>
  );
}
