import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { CommandCenterCard } from "@/components/ui/command-center-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeadCreateForm, LeadStatusForm } from "@/components/leads/lead-forms";
import { requireGymAdminContext } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leads" };

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

export default async function LeadsPage() {
  const { gymId } = await requireGymAdminContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("gym_leads")
    .select("id, name, phone, email, source, notes, status, created_at")
    .eq("gym_id", gymId).order("created_at", { ascending: false }).limit(500);
  const leads = (data ?? []) as Lead[];

  return <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
    <PageHeader eyebrow="Growth" title="Leads" description="Keep prospective members and follow-up status in your gym workspace." />
    {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">Lead records could not be loaded. Confirm the gym-leads migration is installed, then refresh.</p> : <>
      <CommandCenterCard title="Add a lead"><LeadCreateForm /></CommandCenterCard>
      <CommandCenterCard title="Follow-up list">
        {!leads.length ? <EmptyState icon={UsersRound} title="No leads yet" description="Add a prospective member to start tracking follow-up." /> : <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Source</TableHead><TableHead>Added</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{leads.map((lead) => <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell className="min-w-40">{lead.phone ? <p>{lead.phone}</p> : null}{lead.email ? <p className="text-xs text-muted-foreground">{lead.email}</p> : null}{!lead.phone && !lead.email ? "—" : null}</TableCell>
              <TableCell>{lead.source || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(lead.created_at))}</TableCell>
              <TableCell className="max-w-64 whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes || "—"}</TableCell>
              <TableCell className="min-w-48"><LeadStatusForm id={lead.id} status={lead.status} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {leads.length === 500 ? <p className="mt-3 text-xs text-muted-foreground">Showing the latest 500 leads.</p> : null}
        </div>}
      </CommandCenterCard>
    </>}
  </div>;
}
