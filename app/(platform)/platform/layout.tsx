import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identity = await requireRole("platform_owner");

  return (
    <AppShell
      role={identity.role}
      displayName={identity.displayName}
      notifications={[]}
      unreadCount={0}
    >
      {children}
    </AppShell>
  );
}
