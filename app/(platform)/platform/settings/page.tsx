import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { PlatformSettingsForm } from "@/components/platform/platform-settings-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform settings" };

export default async function PlatformSettingsPage() {
  const supabase=await createServerSupabaseClient();
  const {data,error}=await supabase.from("platform_settings").select("brand_name,support_email,default_currency,default_timezone").eq("id",1).maybeSingle();
  return <div className="mx-auto w-full max-w-3xl space-y-6 sm:space-y-7">
    <PageHeader eyebrow="Settings" title="Platform Settings" description="Manage public platform defaults and support contact information. Server secrets remain outside the application UI."/>
    {error||!data?<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Platform settings could not be loaded.</p>:<PlatformSettingsForm settings={data}/>}
  </div>;
}
