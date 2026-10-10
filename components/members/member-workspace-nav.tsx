import Link from "next/link";

const sections = [
  { href: "/gym/members", label: "All Members", key: "members" },
  { href: "/gym/members/memberships", label: "Memberships", key: "memberships" },
  { href: "/gym/members/billing", label: "Billing", key: "billing" },
] as const;

export function MemberWorkspaceNav({ active }: { active: (typeof sections)[number]["key"] }) {
  return (
    <nav aria-label="Member workspace" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-border/80 bg-surface p-1">
      {sections.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          aria-current={active === section.key ? "page" : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${active === section.key ? "bg-elevated font-semibold text-foreground" : "text-muted-foreground hover:bg-elevated/70 hover:text-foreground"}`}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
