import type { Metadata } from "next";
import { OutstandingDashboard } from "@/components/platform/outstanding-dashboard";

export const metadata: Metadata = { title: "Outstanding SaaS" };

export default function OutstandingPage() {
  return <OutstandingDashboard />;
}
