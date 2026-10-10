import type { Metadata } from "next";
import Image from "next/image";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { PageHeader } from "@/components/ui/page-header";
import { GymSettingsForm } from "@/components/settings/gym-settings-form";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";
import { RegistrationFeeSettingsForm } from "@/components/settings/registration-fee-settings-form";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Settings" };
export default async function SettingsPage() {
 const { user, gymId } = await requireGymAdminContext(); const supabase = await createServerSupabaseClient();
 const [{ data: gym }, { data: settings }, { data: prefRows }] = await Promise.all([
  supabase.from("gyms").select("name, owner_name, phone, email, address, logo_path").eq("id", gymId).maybeSingle(),
  supabase.from("gym_settings").select("currency, timezone, registration_fee_amount, registration_fee_enabled").eq("gym_id", gymId).maybeSingle(),
  supabase.from("notification_preferences").select("event_type, enabled").eq("user_id", user.id).eq("audience", "gym").eq("gym_id", gymId).eq("channel", "in_app"),
 ]);
 if (!gym || !settings) return <p role="alert" className="text-sm text-destructive">Gym settings could not be loaded.</p>;
 const current = Object.fromEntries((prefRows ?? []).map((r) => [r.event_type, r.enabled]));
 const { data: logo } = gym.logo_path ? await supabase.storage.from("vyro-gym-logos").createSignedUrl(gym.logo_path, 900) : { data: null };
 return <div className="mx-auto max-w-4xl space-y-6"><PageHeader eyebrow="Workspace" title="Settings" description="Gym identity, regional defaults, and in-app notification preferences."/>
  {logo?.signedUrl ? <Image src={logo.signedUrl} alt={`${gym.name} logo`} width={80} height={80} unoptimized className="h-20 w-20 rounded-lg border border-border bg-white object-contain p-2"/> : null}
  <CommandCenterCard title="Gym profile"><GymSettingsForm gym={gym} settings={{ currency: settings.currency ?? "INR", timezone: settings.timezone ?? "Asia/Kolkata" }}/></CommandCenterCard>
  <CommandCenterCard title="First-time registration fee"><RegistrationFeeSettingsForm settings={{ amount: settings.registration_fee_amount ?? 0, enabled: settings.registration_fee_enabled ?? false }}/></CommandCenterCard>
  <CommandCenterCard title="Notifications"><NotificationPreferencesForm current={current}/></CommandCenterCard>
 </div>;
}
