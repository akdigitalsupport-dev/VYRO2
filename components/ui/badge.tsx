import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-[0.015em]",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-elevated text-muted-foreground",
        accent: "border-transparent bg-accent-subtle text-accent",
        positive: "border-transparent bg-[color-mix(in_srgb,var(--positive)_16%,transparent)] text-positive",
        warning: "border-transparent bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-warning",
        danger: "border-transparent bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
