export type NavIconName =
  | "activity" | "banknote" | "building" | "calendar" | "clipboard" | "credit-card"
  | "file-warning" | "heart" | "id-card" | "layout" | "life-buoy" | "plus"
  | "receipt" | "settings" | "shield" | "sparkles" | "timer" | "user" | "users" | "wallet" | "download";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const platformNav: NavSection[] = [
  {
    title: "Operate",
    items: [{ href: "/platform", label: "Overview", icon: "layout" }],
  },
  {
    title: "Gyms",
    items: [
      { href: "/platform/gyms", label: "All Gyms", icon: "building" },
      { href: "/platform/gyms/new", label: "Add Gym", icon: "plus" },
      { href: "/platform/gyms/trials", label: "Trials", icon: "timer" },
      { href: "/platform/gyms/active", label: "Active", icon: "heart" },
      { href: "/platform/gyms/suspended", label: "Suspended", icon: "file-warning" },
    ],
  },
  {
    title: "Revenue",
    items: [
      { href: "/platform/revenue", label: "SaaS Subscriptions", icon: "credit-card" },
      { href: "/platform/revenue/payments", label: "SaaS Payments", icon: "receipt" },
      { href: "/platform/revenue/outstanding", label: "Outstanding", icon: "clipboard" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { href: "/platform/plans", label: "SaaS Plans", icon: "layout" },
      { href: "/platform/plans/pricing", label: "Custom Pricing", icon: "receipt" },
      { href: "/platform/trials", label: "Trials", icon: "timer" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/platform/reports", label: "Reports", icon: "clipboard" },
      { href: "/platform/support", label: "Support", icon: "life-buoy" },
      { href: "/platform/system", label: "System Health", icon: "activity" },
      { href: "/platform/audit", label: "Audit Logs", icon: "shield" },
      { href: "/platform/settings", label: "Platform Settings", icon: "settings" },
    ],
  },
];

export function flattenNav(sections: NavSection[]) {
  return sections.flatMap((section) => section.items);
}
