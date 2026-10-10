import { VyroWordmark } from "@/components/brand/vyro-mark";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
        <VyroWordmark />
        <div className="max-w-md space-y-4">
          <p className="font-display text-4xl leading-tight">Run your gym. Know your business.</p>
          <p className="text-sm leading-6 text-muted-foreground">
            VYRO is a multi-tenant operating system for gym owners — members, money, renewals, and attendance in one
            precise workspace.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Platform owner workspace separate from gym operations</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <VyroWordmark />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-3xl">{title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
