import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Outstanding SaaS" };

export default function Page() {
  return (
    <ModulePage kicker="Revenue" title="Outstanding" description="Unpaid VYRO SaaS invoices. Separate from gym member dues." />
  );
}
