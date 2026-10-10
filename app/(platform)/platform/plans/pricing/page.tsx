import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Custom pricing" };

export default function Page() {
  return (
    <ModulePage
      kicker="Plans"
      title="Custom Pricing"
      description="Negotiated monthly SaaS prices per gym. Example: ₹499, ₹999, ₹1,499, ₹2,499."
    />
  );
}
