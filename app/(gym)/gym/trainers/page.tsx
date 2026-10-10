import type { Metadata } from "next";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { PageHeader } from "@/components/ui/page-header";
import { TrainerEditor } from "@/components/trainers/trainer-editor";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Trainers" };
export default async function TrainersPage() {
 const { gymId } = await requireGymAdminContext(); const supabase = await createServerSupabaseClient();
 const { data: trainers, error } = await supabase.from("trainers").select("id, name, phone, specialization, status, notes, created_at").eq("gym_id", gymId).order("name").limit(500);
 return <div className="mx-auto max-w-[1200px] space-y-6"><PageHeader eyebrow="Operations" title="Trainers" description="Manage the staff who support your gym. Trainer records are private to this gym."/>
  <CommandCenterCard title="Add trainer"><TrainerEditor/></CommandCenterCard><CommandCenterCard title="Team directory">
   {error ? <p role="alert" className="text-sm text-destructive">Trainer records could not be loaded.</p> : !trainers?.length ? <p className="rounded border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No trainers have been added yet.</p> : <div className="grid gap-3 md:grid-cols-2">{trainers.map((trainer) => <article key={trainer.id} className="space-y-3 rounded-lg border border-border/80 bg-surface p-4"><div className="flex items-start justify-between"><div><h2 className="font-semibold">{trainer.name}</h2><p className="text-sm text-muted-foreground">{trainer.specialization || "Trainer"} · {trainer.phone || "No phone"}</p></div><span className="rounded-full border border-border px-2 py-1 text-xs capitalize">{trainer.status}</span></div><details><summary className="cursor-pointer text-sm text-accent">Edit details</summary><div className="mt-3"><TrainerEditor item={trainer}/></div></details></article>)}</div>}
  </CommandCenterCard></div>;
}
