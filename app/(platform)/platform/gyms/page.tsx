import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "All gyms" };

export default function PlatformGymsPage() {
  return (
    <ModulePage
      kicker="Gyms"
      title="All Gyms"
      description="Every tenant organization VYRO sells to. Isolation is per organization_id."
      primaryAction={{ label: "Add Gym", href: "/platform/gyms/new" }}
    />
  );
}
