import Link from "next/link";
import { MarketingFooter, MarketingHeader } from "@/components/marketing/chrome";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";

const faq = [
  {
    q: "Is VYRO for one gym or many?",
    a: "VYRO is a SaaS platform. Each gym is an isolated tenant. Gym owners run their gym. The platform owner runs VYRO.",
  },
  {
    q: "Does VYRO process member card payments today?",
    a: "Not yet. Gym membership money is recorded in an internal ledger first. A payment gateway can be added later without mixing it with VYRO SaaS billing.",
  },
  {
    q: "Can two gyms see each other's members?",
    a: "No. Tenant isolation is enforced in the database. Organization data is never shared across gyms.",
  },
  {
    q: "Can pricing be negotiated per gym?",
    a: "Yes. Standard SaaS plans exist, and custom monthly pricing can be set per gym.",
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="space-y-6">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">The operating system for modern gyms</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
              Run your gym.
              <br />
              Know your business.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              Members. Payments. Renewals. Attendance. Revenue. One system — built so gym owners can see what needs
              attention before money is missed.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/signup">Start Free Trial</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
          </div>
          <aside id="command-center" className="rounded-lg border border-border bg-surface p-5" aria-label="Product preview">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Product preview · not customer results</p>
            <h2 className="mt-2 font-display text-2xl">Command Center</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatCard label="Collected" value="—" hint="Live totals after Phase 5" />
              <StatCard label="Active members" value="—" hint="Live counts after Phase 3" />
              <StatCard label="Check-ins" value="—" hint="Live attendance after Phase 6" />
              <StatCard label="Outstanding" value="—" hint="Live dues after Phase 5" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Today&apos;s actions appear here when memberships, dues, and leads exist.</p>
          </aside>
        </section>

        <section id="how-it-works" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-3">
            <div>
              <h2 className="font-display text-2xl">The problem</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Gyms lose money in spreadsheets, missed renewals, and unclear dues. Staff need a fast desk. Owners need a
                clear morning view.
              </p>
            </div>
            <div>
              <h2 className="font-display text-2xl">What VYRO is</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A premium gym operating system: members, memberships, money, attendance, staff, leads, expenses, and
                reports — isolated per gym.
              </p>
            </div>
            <div>
              <h2 className="font-display text-2xl">What it is not</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Not a single-gym desktop tool. Not a generic admin panel. Not a mix of SaaS billing and member payments.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 md:grid-cols-2">
          {[
            ["Members", "Search, profiles, photos, history — without loading the entire gym into the browser."],
            ["Memberships", "New, renew, freeze, resume. History is preserved. Renewals never overwrite the last term."],
            ["Payments", "A gym ledger for cash, UPI, card, and transfers. Partial payments and dues stay visible."],
            ["Revenue", "Collected, expected, outstanding. SaaS billing for VYRO stays in a separate domain."],
            ["Attendance", "Fast check-in at reception. Daily and monthly counts without extra screens."],
            ["Reports", "Practical views: growth, renewals, dues, attendance, expenses. CSV when it helps."],
          ].map(([title, copy]) => (
            <article key={title} className="rounded-lg border border-border bg-surface p-6">
              <h2 className="font-display text-xl">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </article>
          ))}
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl">Why VYRO</h2>
            <ul className="mt-6 grid gap-4 text-sm leading-6 text-muted-foreground md:grid-cols-3">
              <li>Built for many gyms from day one, not retrofitted later.</li>
              <li>Action over vanity metrics. The Command Center tells you what to do next.</li>
              <li>Three money domains stay separate: VYRO SaaS, member billing, gym expenses.</li>
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl">Pricing</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Plans are configured by the platform. Starter, Growth, Pro, and Enterprise are supported. Individual gyms can
            have custom negotiated monthly prices.
          </p>
          <Button asChild className="mt-6">
            <Link href="/pricing">View pricing architecture</Link>
          </Button>
        </section>

        <section id="faq" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl">FAQ</h2>
            <dl className="mt-8 grid gap-8 md:grid-cols-2">
              {faq.map((item) => (
                <div key={item.q}>
                  <dt className="font-medium">{item.q}</dt>
                  <dd className="mt-2 text-sm leading-6 text-muted-foreground">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-display text-3xl">Start with a trial.</h2>
              <p className="mt-2 text-sm text-muted-foreground">Onboarding stays short: gym details, plans, first member, Command Center.</p>
            </div>
            <Button asChild size="lg">
              <Link href="/signup">Start Free Trial</Link>
            </Button>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
