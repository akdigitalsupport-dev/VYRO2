import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ActionCard({
  severity,
  title,
  explanation,
  amount,
  deadline,
  actionLabel,
  href,
  className,
}: {
  severity: "info" | "attention" | "critical";
  title: string;
  explanation: string;
  amount?: string;
  deadline?: string;
  actionLabel: string;
  href: string;
  className?: string;
}) {
  const tone = severity === "critical" ? "danger" : severity === "attention" ? "warning" : "default";

  return (
    <article className={cn("flex flex-col gap-4 rounded-lg border border-border/90 bg-surface p-4 shadow-sm sm:p-5", className)}>
      <div className="space-y-2">
        <Badge variant={tone}>{severity}</Badge>
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{explanation}</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm">
          {amount ? <p className="tabular-nums">{amount}</p> : null}
          {deadline ? <p className="text-muted-foreground">{deadline}</p> : null}
        </div>
        <Button asChild size="sm">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      </div>
    </article>
  );
}
