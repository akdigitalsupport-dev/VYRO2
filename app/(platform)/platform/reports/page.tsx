import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Platform reports" };

export default function Page() {
  return <ModulePage kicker="Reports" title="Reports" description="Platform-level usage and SaaS revenue reports. Not gym operating reports." />;
}
