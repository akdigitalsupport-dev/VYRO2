import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Trial programs" };

export default function Page() {
  return (
    <ModulePage kicker="Trials" title="Trials" description="Trial length and conversion to paid SaaS subscription." />
  );
}
