import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Support" };

export default function Page() {
  return <ModulePage kicker="Support" title="Support" description="Customer gym issues tracked at the platform layer." />;
}
