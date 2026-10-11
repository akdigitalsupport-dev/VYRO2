import type { Metadata } from "next";
import { SubscriptionDirectory } from "@/components/platform/subscription-directory";

export const metadata: Metadata = { title: "SaaS subscriptions" };

export default async function PlatformSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <SubscriptionDirectory filter="all" searchQuery={q} description="View VYRO subscriptions for each customer gym, including trial status, plan name, price, dates, and billing period. This is separate from gym member billing." />;
}
