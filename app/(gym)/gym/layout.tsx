import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function GymLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const identity = await requireRole("gym_admin");
  return <AppShell role={identity.role} displayName={identity.displayName}>{children}</AppShell>;
}
