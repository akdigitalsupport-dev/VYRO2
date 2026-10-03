import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardHeader, DataPanel } from "@/components/dashboard";
import { inviteGymAdmin, recordPlatformPayment, saveGymSubscription, updateGym, updateGymStatus } from "@/lib/platform/actions";

export default async function GymDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; saved?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data: gym, error }, { data: subscription }, { count: adminCount }] = await Promise.all([
    supabase.from("gyms").select("id, name, owner_name, phone, email, address, status, created_at").eq("id", id).maybeSingle(),
    supabase.from("platform_subscriptions").select("id, plan_name, starts_on, expires_on, status, amount, currency").eq("gym_id", id).order("expires_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("gym_user_memberships").select("id", { count: "exact", head: true }).eq("gym_id", id).eq("role", "gym_admin"),
  ]);
  if (error) return <div className="notice" role="alert">Gym information could not be loaded. Check your connection and retry.</div>;
  if (!gym) notFound();
  return <>
    <DashboardHeader eyebrow="Gym details" title={gym.name} description="Organization profile and platform subscription status." />
    {query.error && !query.error.startsWith("invite") && query.error !== "provision" && <p className="form-error" role="alert">The change could not be saved. Try again.</p>}
    {query.error?.startsWith("invite") && <p className="form-error" role="alert">{query.error === "invite-config" ? "Admin invitations need SUPABASE_SERVICE_ROLE_KEY configured on the server." : "The invitation could not be sent. Check the email, Auth email settings, and gym provisioning."}</p>}
    {query.error === "provision" && <p className="form-error" role="alert">The invite email was sent, but gym access could not be provisioned. The account has no tenant access until an owner resolves this.</p>}
    {query.saved && <p className="success-message" role="status">{query.saved === "subscription" ? "Subscription saved." : query.saved === "payment" ? "Platform payment recorded." : query.saved === "invite" ? "Invitation sent and gym access provisioned." : query.saved === "profile" ? "Gym profile saved." : "Gym status updated."}</p>}
    <div className="dashboard-columns">
      <DataPanel title="Organization profile" description="Contact details recorded for this gym.">
        <form action={updateGym} className="record-form"><input type="hidden" name="id" value={gym.id} /><label>Gym name<input name="name" required minLength={2} maxLength={160} defaultValue={gym.name} /></label><label>Owner or primary contact<input name="owner_name" maxLength={160} defaultValue={gym.owner_name || ""} /></label><label>Phone<input name="phone" type="tel" maxLength={40} defaultValue={gym.phone || ""} /></label><label>Email<input name="email" type="email" maxLength={254} defaultValue={gym.email || ""} /></label><label>Address<textarea name="address" rows={2} maxLength={500} defaultValue={gym.address || ""} /></label><button className="button button-primary" type="submit">Save profile</button></form>
        <form action={updateGymStatus} className="status-form"><input type="hidden" name="gymId" value={gym.id} /><label htmlFor="gym-status">Gym status</label><select id="gym-status" name="status" defaultValue={gym.status}><option value="active">Active</option><option value="expiring">Expiring</option><option value="expired">Expired</option><option value="suspended">Suspended</option></select><button className="button button-primary" type="submit">Save status</button></form>
        <div className="panel-heading"><div><h2>Gym admins · {adminCount ?? 0}</h2><p>Invite a gym administrator to this tenant.</p></div></div>
        <form action={inviteGymAdmin} className="record-form"><input type="hidden" name="gym_id" value={gym.id} /><label>Administrator name<input name="display_name" required maxLength={160} /></label><label>Administrator email<input name="email" type="email" required maxLength={254} /></label><button className="button" type="submit">Send invite</button><p className="form-footnote">Invitation requires the server-only SUPABASE_SERVICE_ROLE_KEY and configured Auth email.</p></form>
      </DataPanel>
      <DataPanel title="VYRO subscription" description="Platform billing for this organization.">
        {(() => { const starts = subscription?.starts_on || new Date().toISOString().slice(0, 10); const defaultEnd = new Date(); defaultEnd.setMonth(defaultEnd.getMonth() + 1); const ends = subscription?.expires_on || defaultEnd.toISOString().slice(0, 10); return <form action={saveGymSubscription} className="record-form"><input type="hidden" name="gym_id" value={gym.id} /><input type="hidden" name="subscription_id" value={subscription?.id || ""} /><label>Plan name<input name="plan_name" required maxLength={120} defaultValue={subscription?.plan_name || "Monthly"} /></label><div className="form-grid"><label>Amount<input name="amount" type="number" min={0} max={100000000} step="0.01" required defaultValue={subscription?.amount ?? ""} /></label><label>Currency<input name="currency" required minLength={3} maxLength={3} defaultValue={subscription?.currency || "INR"} /></label></div><div className="form-grid"><label>Starts<input name="starts_on" type="date" required defaultValue={starts} /></label><label>Expires<input name="expires_on" type="date" required defaultValue={ends} /></label></div><label>Status<select name="status" defaultValue={subscription?.status || "active"}><option value="active">Active</option><option value="expired">Expired</option><option value="suspended">Suspended</option><option value="cancelled">Cancelled</option></select></label><button className="button button-primary" type="submit">{subscription ? "Save subscription" : "Create subscription"}</button></form>; })()}
        {subscription && <><div className="panel-heading"><div><h2>Record VYRO payment</h2><p>Logs an offline subscription payment.</p></div></div><form action={recordPlatformPayment} className="record-form"><input type="hidden" name="gym_id" value={gym.id} /><input type="hidden" name="subscription_id" value={subscription.id} /><div className="form-grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={subscription.amount} /></label><label>Currency<input name="currency" maxLength={3} minLength={3} required defaultValue={subscription.currency} /></label></div><label>Reference<input name="reference" maxLength={120} /></label><button className="button" type="submit">Record payment</button></form></>}
      </DataPanel>
    </div>
  </>;
}
