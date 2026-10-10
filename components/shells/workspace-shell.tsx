"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Banknote, Building2, CalendarCheck, ClipboardList, CreditCard, FileWarning, Download,
  HeartPulse, IdCard, LayoutGrid, LifeBuoy, Menu, Plus, Receipt, Settings, Shield,
  Sparkles, Timer, UserRound, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { VyroWordmark } from "@/components/brand/vyro-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { flattenNav, type NavIconName, type NavSection } from "@/lib/navigation/platform";
import { cn } from "@/lib/utils";
import { NotificationCenter } from "@/components/notification-center";
import type { InAppNotification } from "@/lib/notifications/server";

const navIcons: Record<NavIconName, LucideIcon> = {
  activity: Activity,
  banknote: Banknote,
  building: Building2,
  calendar: CalendarCheck,
  clipboard: ClipboardList,
  "credit-card": CreditCard,
  "file-warning": FileWarning,
  heart: HeartPulse,
  "id-card": IdCard,
  layout: LayoutGrid,
  "life-buoy": LifeBuoy,
  plus: Plus,
  receipt: Receipt,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  timer: Timer,
  user: UserRound,
  users: Users,
  wallet: Wallet,
  download: Download,
};

function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="space-y-7">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-2.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">{section.title}</p>
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = navIcons[item.icon];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm font-medium transition-colors",
                      active
                        ? "border-accent/20 bg-accent-subtle text-foreground before:absolute before:-left-px before:inset-y-2 before:w-0.5 before:rounded-full before:bg-accent"
                        : "border-transparent text-muted-foreground hover:border-border/60 hover:bg-elevated hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function WorkspaceShell({
  eyebrow,
  title,
  nav,
  accountLabel,
  notifications = [],
  pushEnabled = false,
  pushPublicKey = "",
  children,
}: {
  eyebrow: string;
  title: string;
  nav: NavSection[];
  accountLabel: string;
  notifications?: InAppNotification[];
  pushEnabled?: boolean;
  pushPublicKey?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mobileCurrent = flattenNav(nav).find((item) => item.href === pathname)?.label ?? title;
  const accountHref = flattenNav(nav).find((item) => item.href.endsWith("/settings"))?.href ?? "/";

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border/80 bg-surface/95 px-4 py-5 shadow-[12px_0_40px_rgba(0,0,0,0.12)] lg:flex lg:flex-col">
        <Link href="/" className="mb-7 px-2">
          <VyroWordmark />
        </Link>
        <div className="mb-6 rounded-md border border-border/70 bg-background/45 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Workspace</p>
          <p className="mt-1 text-sm font-medium text-foreground">{eyebrow}</p>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-4 pr-1">
          <NavList sections={nav} pathname={pathname} />
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/80 bg-background/90 px-3 py-2.5 backdrop-blur-xl sm:px-5 lg:px-8">
          <div className="flex shrink-0 items-center gap-2.5 lg:hidden">
            <Button type="button" variant="ghost" size="icon" aria-label="Open navigation" onClick={() => setOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <VyroWordmark />
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
            <p className="mt-0.5 truncate font-display text-base font-semibold">{title}</p>
          </div>
          <p className="min-w-0 flex-1 truncate text-right font-display text-sm font-semibold lg:hidden">{mobileCurrent}</p>
          <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
            <NotificationCenter
              audience={nav.some((section) => section.items.some((item) => item.href === "/gym/command-center")) ? "gym" : "platform"}
              notifications={notifications}
              unreadCount={0}
              pushEnabled={pushEnabled}
              pushPublicKey={pushPublicKey}
            />
            <Link href={accountHref} aria-label="Account settings" className="hidden max-w-56 items-center gap-2 truncate rounded-md border border-border/70 bg-surface px-2.5 py-2 text-xs text-muted-foreground transition hover:border-accent/40 hover:text-foreground md:flex" title={accountLabel}>
              <UserRound className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate">{accountLabel}</span>
              <span className="sr-only">Account</span>
            </Link>
            <LogoutButton />
          </div>
          <Link href={accountHref} aria-label="Account settings" className="w-full truncate border-t border-border/60 pt-2 text-left text-[11px] text-muted-foreground md:hidden lg:hidden">Account · {accountLabel}</Link>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side="left">
          <DrawerTitle className="sr-only">Navigation</DrawerTitle>
          <div className="mb-6 flex items-center justify-between">
            <VyroWordmark />
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Close navigation">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
          <p className="mb-5 rounded-md border border-border/70 bg-background/45 px-3 py-2 text-xs font-medium text-muted-foreground">{eyebrow}</p>
          <NavList sections={nav} pathname={pathname} onNavigate={() => setOpen(false)} />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
