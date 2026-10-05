import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/guards";
import { loadNotificationCenter } from "@/lib/notifications/server";

export const dynamic = "force-dynamic";

export default async function GymLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await requireRole("gym_admin");
  const notificationData = await loadNotificationCenter(identity);
  return <AppShell role={identity.role} displayName={identity.displayName} notifications={notificationData.notifications} unreadCount={notificationData.unreadCount} timeZone={notificationData.timeZone}>{children}</AppShell>;
}
