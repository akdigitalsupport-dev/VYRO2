import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import type { AppRole } from "@/lib/auth/guards";

const platformNav = [
  ["Overview", "/platform/dashboard", "◫"],
  ["Gyms", "/platform/gyms", "⌂"],
  ["Subscriptions", "/platform/subscriptions", "◇"],
  ["Renewals", "/platform/renewals", "↻"],
  ["Revenue", "/platform/revenue", "₹"],
  ["Reports", "/platform/reports", "▤"],
  ["System", "/platform/system", "◉"],
  ["Settings", "/platform/settings", "⚙"],
];
const gymNav = [
  ["Dashboard", "/gym/dashboard", "◫"],
  ["Members", "/gym/members", "♙"],
  ["Plans", "/gym/plans", "◇"],
  ["Attendance", "/gym/attendance", "◷"],
  ["Payments", "/gym/payments", "₹"],
  ["Reports", "/gym/reports", "▤"],
  ["Gym settings", "/gym/settings", "⚙"],
];

export function AppShell({ role, displayName, children }: { role: AppRole; displayName: string | null; children: React.ReactNode }) {
  const isPlatform = role === "platform_owner";
  const nav = isPlatform ? platformNav : gymNav;
  const sectionName = isPlatform ? "Platform" : "Gym workspace";
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href={isPlatform ? "/platform/dashboard" : "/gym/dashboard"} aria-label="VYRO home">
          <span className="brand-mark">V</span><span>VYRO</span>
        </Link>
        <div className="nav-caption">{sectionName}</div>
        <nav className="side-nav" aria-label={`${sectionName} navigation`}>
          {nav.map(([label, href, icon]) => <Link key={href} href={href}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-avatar">{(displayName || "V").slice(0, 1).toUpperCase()}</div>
          <div className="account-copy"><strong>{displayName || (isPlatform ? "Platform owner" : "Gym admin")}</strong><span>{isPlatform ? "Platform owner" : "Gym admin"}</span></div>
          <form action={signOut}><button className="signout" type="submit" aria-label="Sign out" title="Sign out">↗</button></form>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
