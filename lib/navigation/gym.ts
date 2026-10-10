import type { NavSection } from "@/lib/navigation/platform";

export const gymNav: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/gym/command-center", label: "Dashboard", icon: "layout" },
      { href: "/gym/members", label: "Members", icon: "users" },
      { href: "/gym/plans", label: "Plans", icon: "clipboard" },
      { href: "/gym/attendance", label: "Attendance", icon: "calendar" },
      { href: "/gym/trainers", label: "Trainers", icon: "user" },
      { href: "/gym/expenses", label: "Expenses", icon: "wallet" },
      { href: "/gym/reports", label: "Reports", icon: "banknote" },
      { href: "/gym/backup", label: "Backup", icon: "download" },
      { href: "/gym/settings", label: "Settings", icon: "settings" },
    ],
  },
];
