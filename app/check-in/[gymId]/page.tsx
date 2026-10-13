import { notFound } from "next/navigation";
import { PublicCheckInForm } from "@/components/attendance/public-check-in-form";
import { VyroWordmark } from "@/components/brand/vyro-mark";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicGymCheckInPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gymId)) notFound();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_public_gym_checkin_branding", { p_gym_id: gymId });
  if (error) {
    console.error("Public gym check-in page lookup failed", { code: error.code });
    notFound();
  }
  const gym = Array.isArray(data) ? data[0] as { gym_name: string } | undefined : undefined;
  if (!gym?.gym_name) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md space-y-8 rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <header className="space-y-5 text-center">
          <VyroWordmark className="justify-center" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Member check-in</p>
            <h1 className="mt-2 font-display text-2xl font-semibold">{gym.gym_name}</h1>
          </div>
            <p className="text-sm leading-6 text-muted-foreground">Enter your Member ID to record today&apos;s visit.</p>
        </header>
        <PublicCheckInForm gymId={gymId} />
        <p className="text-center text-xs text-muted-foreground">Powered by VYRO</p>
      </section>
    </main>
  );
}
