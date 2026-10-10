import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "Active gyms" };

export default async function ActiveGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="active" searchQuery={q} title="Active Gyms" description="Gyms with an active VYRO subscription and no platform suspension." />;
}
