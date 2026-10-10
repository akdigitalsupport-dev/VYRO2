import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "System health" };

export default function Page() {
  return (
    <ModulePage
      kicker="System"
      title="System Health"
      description="Integration points for monitoring land in Phase 12. This page does not invent uptime numbers."
    />
  );
}
