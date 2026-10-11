import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "All gyms" };

export default async function PlatformGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="all" searchQuery={q} description="Every customer gym workspace, its owner, and its VYRO subscription. Tenant data remains isolated per gym." />;
}
