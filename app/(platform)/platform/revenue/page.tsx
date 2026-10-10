import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "SaaS subscriptions" };

export default function Page() {
  return (
    <ModulePage
      kicker="Revenue"
      title="SaaS Subscriptions"
      description="What gym owners pay VYRO. Custom prices are first-class. This is not gym membership billing."
    />
  );
}
