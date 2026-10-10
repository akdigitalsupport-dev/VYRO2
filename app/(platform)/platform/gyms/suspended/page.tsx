import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Suspended gyms" };

export default function Page() {
  return (
    <ModulePage kicker="Gyms" title="Suspended" description="Tenants whose VYRO access is suspended. This does not rewrite gym member ledgers." />
  );
}
