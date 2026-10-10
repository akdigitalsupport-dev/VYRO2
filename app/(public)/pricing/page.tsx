import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/chrome";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Pricing" };

const tiers = [
  { name: "Starter", intent: "Small independent gyms starting with members and payments." },
  { name: "Growth", intent: "Gyms that need staff roles, leads, and clearer renewals." },
  { name: "Pro", intent: "Multi-staff operations with reporting and tighter control." },
  { name: "Enterprise", intent: "Negotiated terms, custom SaaS price, and platform support." },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingHeader />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">SaaS pricing</p>
        <h1 className="mt-3 font-display text-4xl">Plans are owned by the platform.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Prices are not hard-coded in this product. Platform Admin configures standard plans and can set a custom monthly
          price for any gym. Member payments to a gym are a different ledger.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier) => (
            <article key={tier.name} className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-display text-xl">{tier.name}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{tier.intent}</p>
              <p className="mt-6 text-xs uppercase tracking-[0.14em] text-muted-foreground">Price set in platform admin</p>
            </article>
          ))}
        </div>
        <Button asChild className="mt-10">
          <Link href="/signup">Start Free Trial</Link>
        </Button>
      </main>
      <MarketingFooter />
    </div>
  );
}
