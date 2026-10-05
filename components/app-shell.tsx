"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth/actions";
import type { AppRole } from "@/lib/auth/guards";

type NavigationItem = { label: string; href: string; icon: string };

const platformNav: NavigationItem[] = [
  { label: "Overview", href: "/platform/dashboard", icon: "◫" },
  { label: "Gyms", href: "/platform/gyms", icon: "⌂" },
  { label: "Subscriptions", href: "/platform/subscriptions", icon: "◇" },
  { label: "Renewals", href: "/platform/renewals", icon: "↻" },
  { label: "Revenue", href: "/platform/revenue", icon: "₹" },
  { label: "Reports", href: "/platform/reports", icon: "▤" },
  { label: "System", href: "/platform/system", icon: "◉" },
  { label: "Settings", href: "/platform/settings", icon: "⚙" },
];

const gymNav: NavigationItem[] = [
  { label: "Dashboard", href: "/gym/dashboard", icon: "◫" },
  { label: "Members", href: "/gym/members", icon: "♙" },
  { label: "Plans", href: "/gym/plans", icon: "◇" },
  { label: "Attendance", href: "/gym/attendance", icon: "◷" },
  { label: "Payments", href: "/gym/payments", icon: "₹" },
  { label: "Reports", href: "/gym/reports", icon: "▤" },
  { label: "Settings", href: "/gym/settings", icon: "⚙" },
];

function Navigation({ items, pathname, mobile = false }: { items: NavigationItem[]; pathname: string; mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav-links" : "side-nav"} aria-label={mobile ? "Workspace" : "Primary"}>
      {items.map(({ label, href, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span className="nav-icon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ role, displayName, children }: { role: AppRole; displayName: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const isPlatform = role === "platform_owner";
  const nav = isPlatform ? platformNav : gymNav;
  const sectionName = isPlatform ? "Platform" : "Gym workspace";
  const title = nav.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`))?.label ?? sectionName;
  const accountName = displayName || (isPlatform ? "Platform owner" : "Gym admin");

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href={isPlatform ? "/platform/dashboard" : "/gym/dashboard"} aria-label="VYRO home">
          <span className="brand-mark">V</span><span>VYRO</span>
        </Link>
        <div className="nav-caption">{sectionName}</div>
        <Navigation items={nav} pathname={pathname} />
        <div className="sidebar-bottom">
          <div className="account-avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</div>
          <div className="account-copy"><strong>{accountName}</strong><span>{isPlatform ? "Platform owner" : "Gym admin"}</span></div>
        </div>
      </aside>

      <div className="main-content">
        <header className="app-topbar">
          <details className="mobile-nav">
            <summary aria-label="Open workspace navigation"><span aria-hidden="true">☰</span></summary>
            <Navigation items={nav} pathname={pathname} mobile />
          </details>
          <Link className="topbar-brand" href={isPlatform ? "/platform/dashboard" : "/gym/dashboard"} aria-label="VYRO home">
            <span className="brand-mark">V</span><span>VYRO</span>
          </Link>
          <div className="topbar-title"><span>{sectionName}</span><strong>{title}</strong></div>
          <div className="topbar-account">
            <div className="account-avatar" aria-hidden="true">{accountName.slice(0, 1).toUpperCase()}</div>
            <div className="account-copy"><strong>{accountName}</strong><span>{isPlatform ? "Platform owner" : "Gym admin"}</span></div>
            <form action={signOut}><button className="signout" type="submit" aria-label="Sign out" title="Sign out">↗</button></form>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
