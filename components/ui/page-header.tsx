export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        <h1 className="font-display text-[1.8rem] font-semibold leading-tight tracking-[-0.045em] text-foreground sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="min-w-0 shrink-0">{children}</div> : null}
    </header>
  );
}
