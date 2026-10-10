import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <article className={cn("group relative overflow-hidden rounded-xl border border-border/90 bg-surface p-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)] transition-colors duration-200 hover:border-accent/40 sm:p-5", className)}>
      <div className="flex min-h-7 items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/80 bg-elevated text-accent">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 min-w-0 break-words font-display text-[clamp(1.25rem,2.4vw,2rem)] font-semibold leading-none tabular-nums tracking-[-0.04em] text-foreground">{value}</p>
      {hint ? <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </article>
  );
}
