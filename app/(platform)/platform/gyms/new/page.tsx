import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateGymTrialForm } from "@/components/platform/create-gym-trial-form";

export const metadata: Metadata = { title: "Add gym" };

export default function AddGymPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-3">
        <Link href="/platform/gyms" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All gyms
        </Link>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Gyms / Tenant setup</p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.04em]">Add Gym</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Provision a customer workspace and start its free trial. VYRO creates the gym, settings, owner membership,
            trial subscription, and audit trail together; the owner is invited by email to finish account setup.
          </p>
        </div>
      </header>
      <CreateGymTrialForm />
    </div>
  );
}
