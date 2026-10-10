import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = { title: "Add gym" };

export default function AddGymPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Gyms</p>
        <h1 className="font-display text-3xl">Add Gym</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Creating a gym will later: create an organization, invite or create the owner, assign the owner role, create a
          SaaS subscription, and write an audit event — all server-side. Client inserts of organizations are not allowed.
        </p>
      </header>
      <form className="space-y-5 rounded-lg border border-border bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="gym-name" label="Gym name" />
          <Field id="owner-name" label="Owner name" />
          <Field id="owner-email" label="Owner email" type="email" />
          <Field id="owner-phone" label="Owner phone" />
          <Field id="city" label="City" />
          <Field id="state" label="State" />
          <Field id="country" label="Country" />
          <Field id="custom-price" label="Custom monthly price (₹)" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="address">Address</Label>
          <Textarea id="address" name="address" disabled />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pricing-type" label="Pricing type" placeholder="standard plan or custom" />
          <Field id="trial-duration" label="Trial duration (days)" />
          <DatePicker id="subscription-start" label="Subscription start date" disabled />
          <DatePicker id="billing-date" label="Billing date" disabled />
          <Field id="status" label="Status" placeholder="trial / active / suspended" />
        </div>
        <p className="text-sm text-muted-foreground">Submit is disabled until Phase 1 tenant foundation.</p>
        <Button type="submit" disabled>
          Create gym
        </Button>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} placeholder={placeholder} disabled />
    </div>
  );
}
