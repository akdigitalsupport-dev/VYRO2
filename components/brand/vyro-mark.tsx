import { cn } from "@/lib/utils";

export function VyroMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("h-8 w-8", className)}
    >
      <rect width="32" height="32" rx="6" fill="#121816" />
      <path
        d="M7 8h6.2L16 18.4 18.8 8H25L18.1 24h-4.2L7 8Z"
        fill="#F4F1EA"
      />
      <path d="M11.4 24h9.2v2.2h-9.2z" fill="#D9783A" />
    </svg>
  );
}

export function VyroWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <VyroMark className="h-7 w-7" />
      <span className="font-display text-sm font-semibold tracking-[0.18em]">VYRO</span>
    </span>
  );
}
