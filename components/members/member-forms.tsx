"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createMemberAction, updateMemberAction } from "@/app/(gym)/gym/members/actions";
import { MemberPhotoPicker } from "@/components/members/member-photo-picker";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialFormActionState, type FormActionState } from "@/lib/forms";
import { addDaysToIsoDate } from "@/lib/validation/member-finance";

export type ActivePlanOption = {
  id: string;
  name: string;
  duration_days: number;
  price: number | string;
};

type EditableMember = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  joining_date: string;
  photoUrl?: string | null;
};

function FieldError({ state, name }: { state: FormActionState; name: string }) {
  const message = state.fieldErrors?.[name];
  return message ? <p id={`${name}-error`} className="text-xs text-danger">{message}</p> : null;
}

function FormMessage({ state }: { state: FormActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error"
        ? "rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"
        : "rounded-md border border-positive/30 bg-positive/10 px-3 py-2.5 text-sm text-positive"}
    >
      {state.message}
    </p>
  );
}

function GenderSelect({ defaultValue = "" }: { defaultValue?: string }) {
  const genderValue = defaultValue || "not_specified";
  return (
    <Select name="gender" defaultValue={genderValue}>
      <SelectTrigger id="gender" aria-label="Gender">
        <SelectValue placeholder="Not specified" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="not_specified">Not specified</SelectItem>
        <SelectItem value="female">Female</SelectItem>
        <SelectItem value="male">Male</SelectItem>
        <SelectItem value="non_binary">Non-binary</SelectItem>
        <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
      </SelectContent>
    </Select>
  );
}

function MemberFields({ member, state }: { member?: EditableMember; state: FormActionState }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="full_name">Full name <span className="text-accent">*</span></Label>
          <Input id="full_name" name="full_name" required maxLength={160} defaultValue={member?.full_name} autoComplete="name" aria-invalid={Boolean(state.fieldErrors?.full_name)} aria-describedby={state.fieldErrors?.full_name ? "full_name-error" : undefined} />
          <FieldError state={state} name="full_name" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="phone" name="phone" type="tel" maxLength={32} defaultValue={member?.phone ?? ""} autoComplete="tel" />
          <FieldError state={state} name="phone" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={member?.email ?? ""} autoComplete="email" />
          <FieldError state={state} name="email" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gender">Gender <span className="text-muted-foreground">(optional)</span></Label>
          <GenderSelect defaultValue={member?.gender ?? ""} />
          <FieldError state={state} name="gender" />
        </div>
        <div className="grid gap-1.5">
          <DatePicker id="date_of_birth" name="date_of_birth" label="Date of birth (optional)" defaultValue={member?.date_of_birth ?? ""} />
          <FieldError state={state} name="date_of_birth" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="address">Address <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="address" name="address" maxLength={1000} rows={3} defaultValue={member?.address ?? ""} />
          <FieldError state={state} name="address" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea id="notes" name="notes" maxLength={2000} rows={3} defaultValue={member?.notes ?? ""} />
          <FieldError state={state} name="notes" />
        </div>
      </div>
    </>
  );
}

export function CreateMemberForm({ plans, today, registrationFee }: { plans: ActivePlanOption[]; today: string; registrationFee: { enabled: boolean; amount: number | string } }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createMemberAction, initialFormActionState);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState(today);
  const [paymentAmount, setPaymentAmount] = useState(() => String(plans[0]?.price ?? "0"));
  const [chargeRegistration, setChargeRegistration] = useState(registrationFee.enabled);
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedPrice = Number(selectedPlan?.price ?? Number.NaN);
  const priceAvailable = Number.isFinite(selectedPrice) && selectedPrice >= 0;
  const numericPayment = Number(paymentAmount || 0);
  const paymentAmountValid = paymentAmount.trim() !== "" && Number.isFinite(numericPayment) && numericPayment >= 0 && numericPayment <= selectedPrice;
  const outstanding = Math.max(0, selectedPrice - (Number.isFinite(numericPayment) ? numericPayment : 0));
  const endDate = selectedPlan ? addDaysToIsoDate(startDate, selectedPlan.duration_days) : "";

  useEffect(() => {
    if (state.status === "success" && state.recordId) {
      router.replace(`/gym/members/${state.recordId}?created=1`);
      router.refresh();
    }
  }, [router, state]);

  if (state.status === "success" && state.recordId) {
    return (
      <div className="space-y-4 rounded-lg border border-positive/25 bg-positive/5 p-5">
        <FormMessage state={state} />
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href={`/gym/members/${state.recordId}`}>Open member profile</Link></Button>
          <Button asChild variant="secondary"><Link href="/gym/members">Back to members</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      {state.recordId ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p>{state.message}</p>
          <Button asChild size="sm" variant="secondary" className="mt-3"><Link href={`/gym/members/${state.recordId}`}>Open member profile</Link></Button>
        </div>
      ) : null}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-base font-semibold">Member details</h2>
          <p className="mt-1 text-sm text-muted-foreground">Required fields are marked. Contact and personal details are optional.</p>
        </div>
        <MemberFields state={state} />
        <MemberPhotoPicker memberName="New member" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <DatePicker id="joining_date" name="joining_date" label="Joining date" required defaultValue={today} />
            <FieldError state={state} name="joining_date" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="membership_start_date">Membership start date <span className="text-accent">*</span></Label>
            <Input id="membership_start_date" name="membership_start_date" type="date" required defaultValue={today} />
            <FieldError state={state} name="membership_start_date" />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border/70 pt-5">
        <div>
          <h2 className="font-display text-base font-semibold">Membership</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a plan and start date. VYRO calculates the end date from its saved duration.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="membership_plan_id">Membership plan <span className="text-accent">*</span></Label>
            <Select name="membership_plan_id" value={planId} onValueChange={(nextPlanId) => {
              setPlanId(nextPlanId);
              const nextPlan = plans.find((plan) => plan.id === nextPlanId);
              setPaymentAmount(String(nextPlan?.price ?? "0"));
            }} required>
              <SelectTrigger id="membership_plan_id" aria-label="Membership plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name} · {plan.duration_days} days</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError state={state} name="membership_plan_id" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="membership_start_date">Start date <span className="text-accent">*</span></Label>
            <Input id="membership_start_date" name="membership_start_date" type="date" required value={startDate} onChange={(event) => setStartDate(event.currentTarget.value)} aria-invalid={Boolean(state.fieldErrors?.membership_start_date)} />
            <FieldError state={state} name="membership_start_date" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="membership_end_date">Calculated end date</Label>
            <Input id="membership_end_date" type="date" value={endDate} readOnly aria-readonly="true" />
            <p className="text-xs text-muted-foreground">{selectedPlan ? `${selectedPlan.duration_days} days · ${selectedPlan.name}` : "Choose a plan to see its duration."}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border/70 pt-5">
        <div>
          <h2 className="font-display text-base font-semibold">Billing and payment</h2>
          <p className="mt-1 text-sm text-muted-foreground">The saved membership price is the total due. Enter what the member pays today, or enter 0 to pay later.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-background/35 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Membership price</p>
            <p className="mt-1 font-semibold tabular-nums">{selectedPlan && priceAvailable ? `₹${selectedPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="initial_payment_amount">Payment today (₹)</Label>
            <Input id="initial_payment_amount" name="initial_payment_amount" type="number" min="0" max={priceAvailable ? selectedPrice : undefined} step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.currentTarget.value)} required aria-invalid={Boolean(state.fieldErrors?.initial_payment_amount) || !paymentAmountValid} />
            <FieldError state={state} name="initial_payment_amount" />
            {!paymentAmountValid ? <p className="text-xs text-danger">Payment cannot exceed the membership price.</p> : null}
          </div>
          <div className="rounded-md border border-border/70 bg-background/35 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</p>
            <p className="mt-1 font-semibold tabular-nums">{selectedPlan && priceAvailable ? `₹${outstanding.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</p>
          </div>
          {numericPayment > 0 ? <>
          <div className="grid gap-1.5">
            <Label htmlFor="payment_method">Payment method <span className="text-accent">*</span></Label>
            <select id="payment_method" name="payment_method" defaultValue="cash" required className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25" aria-invalid={Boolean(state.fieldErrors?.payment_method)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
            <FieldError state={state} name="payment_method" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment_date">Payment date <span className="text-accent">*</span></Label>
            <Input id="payment_date" name="payment_date" type="date" max={today} defaultValue={today} required aria-invalid={Boolean(state.fieldErrors?.payment_date)} />
            <FieldError state={state} name="payment_date" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reference">Reference <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="reference" name="reference" maxLength={120} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="payment_notes">Payment notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="payment_notes" name="payment_notes" rows={2} maxLength={500} />
          </div>
          </> : <p className="text-sm text-muted-foreground sm:col-span-3">No payment will be recorded today. You can collect this balance later from the member’s Billing section.</p>}
        </div>
      </section>

      {registrationFee.enabled ? <section className="space-y-4 border-t border-border/70 pt-5">
        <div>
          <h2 className="font-display text-base font-semibold">One-time registration</h2>
          <p className="mt-1 text-sm text-muted-foreground">This separate first-time fee does not reduce the membership balance.</p>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-border/70 bg-background/35 p-3 text-sm font-medium">
          <input type="checkbox" name="charge_registration" checked={chargeRegistration} onChange={(event) => setChargeRegistration(event.currentTarget.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Charge registration fee (₹{Number(registrationFee.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })})
        </label>
        {chargeRegistration ? <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-background/35 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Registration fee</p>
            <p className="mt-1 font-semibold tabular-nums">₹{Number(registrationFee.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="registration_payment_method">Payment method <span className="text-accent">*</span></Label>
            <select id="registration_payment_method" name="registration_payment_method" defaultValue="cash" required className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/25">
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option>
            </select>
            <FieldError state={state} name="registration_payment_method" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="registration_payment_date">Payment date <span className="text-accent">*</span></Label>
            <Input id="registration_payment_date" name="registration_payment_date" type="date" max={today} defaultValue={today} required />
            <FieldError state={state} name="registration_payment_date" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="registration_reference">Reference <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="registration_reference" name="registration_reference" maxLength={120} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="registration_notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea id="registration_notes" name="registration_notes" rows={2} maxLength={500} />
          </div>
        </div> : null}
      </section> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-5 sm:flex-row sm:justify-end">
        <Button asChild type="button" variant="secondary"><Link href="/gym/members">Cancel</Link></Button>
        <Button type="submit" disabled={pending || plans.length === 0 || Boolean(state.recordId) || !priceAvailable || !paymentAmountValid}>
          {pending ? "Creating member…" : state.recordId ? "Member created" : "Create Member"}
        </Button>
      </div>
    </form>
  );
}

export function EditMemberForm({ member }: { member: EditableMember }) {
  const boundUpdateAction = updateMemberAction.bind(null, member.id);
  const [state, formAction, pending] = useActionState(boundUpdateAction, initialFormActionState);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <MemberPhotoPicker memberName={member.full_name} initialPhotoUrl={member.photoUrl} />
      <div className="rounded-md border border-border/80 bg-background/35 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Member code</span>
        <span className="ml-2 font-mono text-foreground">{member.member_code}</span>
      </div>
      <MemberFields member={member} state={state} />
      <div className="rounded-md border border-border/70 bg-background/35 px-4 py-3 text-sm leading-6 text-muted-foreground">
        Joining date and membership records are preserved as history and cannot be changed from this form.
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-5 sm:flex-row sm:justify-end">
        <Button asChild type="button" variant="secondary"><Link href={`/gym/members/${member.id}`}>Cancel</Link></Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
