import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Audit logs" };

export default function Page() {
  return (
    <ModulePage
      kicker="System"
      title="Audit Logs"
      description="Platform and tenant-significant events: actor, organization, action, entity, timestamp, metadata."
    />
  );
}
