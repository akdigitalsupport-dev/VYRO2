import { WorkspaceShell } from "@/components/shells/workspace-shell";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { gymNav } from "@/lib/navigation/gym";

export default async function GymLayout({ children }: { children: React.ReactNode }) {
  const { user, gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { data: gym } = await supabase.from("gyms").select("name, logo_path").eq("id", gymId).maybeSingle();
  const { data: logo } = gym?.logo_path
    ? await supabase.storage.from("vyro-gym-logos").createSignedUrl(gym.logo_path, 3600)
    : { data: null };

  return (
    <WorkspaceShell
      eyebrow="Gym Admin"
      title="Dashboard"
      nav={gymNav}
      accountLabel={user.email ?? "Gym account"}
      pushPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      workspaceBrand={{ name: gym?.name?.trim() || "Gym workspace", logoUrl: logo?.signedUrl ?? null }}
    >
      {children}
    </WorkspaceShell>
  );
}
