import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "SaaS plans" };

export default function Page() {
  return (
    <ModulePage
      kicker="Plans"
      title="SaaS Plans"
      description="Starter, Growth, Pro, and Enterprise exist as plan records configured by Platform Admin — not hard-coded storefront prices."
    />
  );
}
