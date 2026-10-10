import { cn } from "@/lib/utils";

export function CommandCenterCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-border/90 bg-surface p-4 shadow-[0_10px_28px_rgba(0,0,0,0.1)] sm:p-5", className)}>
      <h2 className="mb-4 border-b border-border/70 pb-3 font-display text-sm font-semibold tracking-[-0.015em] text-foreground">{title}</h2>
      {children}
    </section>
  );
}
