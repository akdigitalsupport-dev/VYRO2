import { WorkspaceShell } from "@/components/shells/workspace-shell";
import { requirePlatformOwner } from "@/lib/auth/guards";
import { platformNav } from "@/lib/navigation/platform";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformOwner();

  return (
    <WorkspaceShell eyebrow="VYRO Platform" title="Platform Admin" nav={platformNav} accountLabel={user.email ?? "Platform account"}>
      {children}
    </WorkspaceShell>
  );
}
