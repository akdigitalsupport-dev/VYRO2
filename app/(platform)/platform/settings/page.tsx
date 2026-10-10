import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Platform settings" };

export default function Page() {
  return <ModulePage kicker="Settings" title="Platform Settings" description="Platform-level configuration. Secrets stay in environment variables, never in the browser." />;
}
