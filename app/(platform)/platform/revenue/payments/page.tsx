import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "SaaS payments" };

export default function Page() {
  return (
    <ModulePage
      kicker="Revenue"
      title="SaaS Payments"
      description="Internal SaaS payment ledger. Razorpay is not connected. No simulated payment success."
    />
  );
}
