import { cn } from "@/lib/utils";

export function Avatar({
  initials,
  src,
  alt,
  className,
}: {
  initials: string;
  src?: string;
  alt?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-border bg-elevated text-xs font-medium",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
