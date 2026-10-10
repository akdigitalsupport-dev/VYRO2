import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "Active gyms" };

export default async function ActiveGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="active" searchQuery={q} title="Active Gyms" description="Customer workspaces whose gym status is active. Trial and payment status remain visible in each row." />;
}
