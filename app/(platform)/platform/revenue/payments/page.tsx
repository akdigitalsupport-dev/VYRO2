import type { Metadata } from "next";
import { PlatformPaymentsDashboard } from "@/components/platform/platform-payments-dashboard";

export const metadata: Metadata = { title: "SaaS payments" };

export default function PlatformPaymentsPage() {
  return <PlatformPaymentsDashboard />;
}
