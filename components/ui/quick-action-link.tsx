import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export function QuickActionLink({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-3 rounded-md border border-border/80 bg-background/35 p-3 transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-accent/40 hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-elevated text-accent transition-colors group-hover:border-accent/25 group-hover:bg-accent-subtle">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" aria-hidden="true" />
    </Link>
  );
}
