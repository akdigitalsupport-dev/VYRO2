import Link from "next/link";
import { VyroWordmark } from "@/components/brand/vyro-mark";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label="VYRO home">
          <VyroWordmark />
        </Link>
        <nav aria-label="Marketing" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#command-center">Product</a>
          <Link href="/pricing">Pricing</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start Free Trial</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <VyroWordmark />
        <p>The operating system for modern gyms.</p>
        <p>© {new Date().getFullYear()} VYRO</p>
      </div>
    </footer>
  );
}
