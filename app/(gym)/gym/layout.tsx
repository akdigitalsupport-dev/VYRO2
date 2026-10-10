import { WorkspaceShell } from "@/components/shells/workspace-shell";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { gymNav } from "@/lib/navigation/gym";

export default async function GymLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireGymAdminContext();

  return (
    <WorkspaceShell eyebrow="Gym workspace" title="Dashboard" nav={gymNav} accountLabel={user.email ?? "Gym account"} pushPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}>
      {children}
    </WorkspaceShell>
  );
}
