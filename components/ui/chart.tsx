import { cn } from "@/lib/utils";

/** Structural chart frame. Real series data is added with reports in later phases. */
export function Chart({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <figure className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <figcaption className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{title}</figcaption>
      <div className="mt-6 flex h-40 items-end gap-2" aria-hidden="true">
        {[28, 44, 36, 62, 48, 70, 40].map((height, index) => (
          <div key={index} className="flex-1 bg-elevated" style={{ height: `${height}%` }} />
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">No live series yet. Charts connect to reports in Phase 9.</p>
    </figure>
  );
}
