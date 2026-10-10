import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EditMemberForm } from "@/components/members/member-forms";
import { Button } from "@/components/ui/button";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { ErrorState } from "@/components/ui/error-state";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit member" };

type EditableMemberRecord = {
  id: string;
  member_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  notes: string | null;
  joining_date: string;
  photo_path: string | null;
};

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { gymId }] = await Promise.all([params, requireGymAdminContext()]);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, member_code, full_name, phone, email, gender, date_of_birth, address, notes, joining_date, photo_path")
    .eq("id", id)
    .eq("gym_id", gymId)
    .maybeSingle();

  if (error) {
    return <ErrorState title="Member details unavailable" description="The member could not be loaded for editing. Refresh the page and try again." />;
  }
  if (!data) notFound();

  const { data: signedPhoto } = data.photo_path
    ? await supabase.storage.from("vyro-member-photos").createSignedUrl(data.photo_path, 3600)
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-7">
      <PageHeader
        eyebrow={`Members · ${data.member_code}`}
        title="Edit member details"
        description="Update contact and personal details. The member code, gym, joining date, and membership history remain unchanged."
      >
        <Button asChild variant="secondary"><Link href={`/gym/members/${id}`}>Cancel</Link></Button>
      </PageHeader>
      <CommandCenterCard title="Member information">
        <EditMemberForm member={{ ...(data as EditableMemberRecord), photoUrl: signedPhoto?.signedUrl ?? null }} />
      </CommandCenterCard>
    </div>
  );
}
