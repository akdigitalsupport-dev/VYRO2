import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ModulePage({
  kicker,
  title,
  description,
  primaryAction,
}: {
  kicker: string;
  title: string;
  description: string;
  primaryAction?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 sm:space-y-7">
      <PageHeader eyebrow={kicker} title={title} description={description} />
      <EmptyState
        icon={Inbox}
        title="No records yet"
        description="This screen is part of the VYRO shell. Data, permissions, and operations land in later phases. Nothing here is simulated production data."
        action={primaryAction}
      />
    </div>
  );
}
