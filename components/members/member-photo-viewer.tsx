"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MemberPhotoViewer({
  src,
  alt,
  children,
  triggerClassName,
}: {
  src: string | null | undefined;
  alt: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  if (!src) return <>{children}</>;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`View ${alt}`}
          className={cn(
            "group inline-flex cursor-zoom-in rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            triggerClassName,
          )}
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-6xl items-center justify-center overflow-hidden border-0 bg-transparent p-0 shadow-none sm:w-[calc(100%-2rem)]">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <DialogDescription className="sr-only">Expanded member photo</DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[calc(100dvh-3rem)] max-w-full rounded-xl object-contain shadow-2xl shadow-black/50"
        />
      </DialogContent>
    </Dialog>
  );
}
