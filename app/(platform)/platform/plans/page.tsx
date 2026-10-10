import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformPlansDashboard } from "@/components/platform/platform-plans-dashboard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "SaaS plans" };

export default async function PlatformPlansPage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("platform_plans")
    .select("id,slug,name,description,price,currency,billing_period,trial_days,is_active")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow="Catalog" title="SaaS Plans" description="Manage VYRO's own subscription packages for customer gyms. These plans are separate from membership plans configured by each gym." />
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          The plan catalogue could not be loaded. The platform plan migration must be installed in this environment before editing plans.
        </p>
      ) : (
        <PlatformPlansDashboard plans={data ?? []} />
      )}
    </div>
  );
}
