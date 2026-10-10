import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Active gyms" };

export default function Page() {
  return (
    <ModulePage kicker="Gyms" title="Active" description="Tenants with an active VYRO SaaS subscription." />
  );
}
