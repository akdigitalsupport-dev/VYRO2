import { saveNotificationPreferences } from "@/lib/notifications/actions";
import { DataPanel } from "@/components/dashboard";

type Preference = { event_type: string; channel: string; enabled: boolean };
const gymEvents = [
  ["membership_expiring", "Membership expiring soon"],
  ["membership_expiry_reminder", "Membership expiry reminder"],
  ["membership_expired", "Membership expired"],
  ["payment_recorded", "Member payment recorded"],
  ["payment_refunded", "Member payment refunded"],
];
const platformEvents = [
  ["gym_subscription_expiring", "Gym subscription expiring"],
  ["gym_subscription_expired", "Gym subscription expired"],
  ["platform_payment_recorded", "VYRO payment recorded"],
  ["platform_payment_refunded", "VYRO payment refunded"],
];

export function NotificationPreferences({ audience, preferences, saved, error }: { audience: "gym" | "platform"; preferences: Preference[]; saved?: string; error?: string }) {
  const events = audience === "gym" ? gymEvents : platformEvents;
  const enabled = new Map(preferences.filter((item) => item.channel === "in_app").map((item) => [item.event_type, item.enabled]));
  return <DataPanel title="Notification preferences" description="Choose which in-app event notices appear in this workspace. External delivery channels are not connected.">
    {saved === "saved" && <p className="success-message" role="status">Notification preferences saved.</p>}
    {(error === "save" || error === "preferences") && <p className="form-error" role="alert">Notification preferences could not be saved or loaded.</p>}
    <form action={saveNotificationPreferences} className="record-form"><input type="hidden" name="audience" value={audience} /><div className="preference-list">{events.map(([key, label]) => <label className="preference-row" key={key}><span>{label}</span><input type="checkbox" name={key} defaultChecked={enabled.get(key) ?? true} aria-label={label} /></label>)}</div><button className="button button-primary" type="submit">Save preferences</button></form>
    <p className="panel-body-copy">Preference storage supports in-app, email, WhatsApp, SMS, and push channels for future integrations. Only in-app delivery is active.</p>
  </DataPanel>;
}
