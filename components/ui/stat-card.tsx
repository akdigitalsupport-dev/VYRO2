import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
  tone?: "default" | "positive";
}) {
  return (
    <article className={cn("group relative overflow-hidden rounded-lg border border-border/90 bg-surface p-4 shadow-[0_10px_28px_rgba(0,0,0,0.12)] sm:p-5", tone === "positive" && "border-positive/35 bg-[color-mix(in_srgb,var(--positive)_6%,var(--surface))]", className)}>
      <div className="flex min-h-7 items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/80 bg-elevated text-accent", tone === "positive" && "border-positive/30 bg-[color-mix(in_srgb,var(--positive)_10%,var(--surface))] text-positive")}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-3 min-w-0 break-words font-display text-[clamp(1.25rem,2.4vw,2rem)] font-semibold leading-none tabular-nums tracking-[-0.04em]", tone === "positive" ? "text-positive" : "text-foreground")}>{value}</p>
      {hint ? <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
    </article>
  );
}
