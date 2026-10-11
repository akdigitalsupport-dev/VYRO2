import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SubscriptionPricingManager } from "@/components/platform/subscription-pricing-manager";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Custom pricing" };

export default async function PlatformCustomPricingPage() {
  const supabase=await createServerSupabaseClient();
  const [subscriptionResult,planResult]=await Promise.all([
    supabase.from("platform_subscriptions").select("id,gym_id,plan_id,plan_name,amount,currency,status,billing_period,starts_on,expires_on,gyms!platform_subscriptions_gym_id_fkey(name,owner_name,email)").order("created_at",{ascending:false}),
    supabase.from("platform_plans").select("id,name,price,currency,billing_period,trial_days,is_active").order("name",{ascending:true})
  ]);
  const error=subscriptionResult.error||planResult.error;
  const subscriptions=(subscriptionResult.data??[]).map(subscription=>{
    const gym=Array.isArray(subscription.gyms)?subscription.gyms[0]:subscription.gyms;
    return {...subscription,gym_name:gym?.name??"Unknown gym",owner_name:gym?.owner_name??null,owner_email:gym?.email??null};
  });
  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <PageHeader eyebrow="Catalog" title="Custom Pricing" description="Assign an active standard SaaS plan or a negotiated price to each gym. Adjust trial expiry separately from subscription status. No action here records a payment or pretends a charge succeeded."/>
    {error?<p role="alert" className="rounded-md border border-warning/40 bg-warning/5 p-4 text-sm text-warning">Subscription pricing data could not be loaded. Check database access and the platform pricing schema, then refresh.</p>:<SubscriptionPricingManager subscriptions={subscriptions} plans={planResult.data??[]}/>}
  </div>;
}
