import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "Suspended gyms" };

export default async function SuspendedGymsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="suspended" searchQuery={q} title="Suspended Gyms" description="Gyms whose workspace or VYRO subscription is suspended." />;
}
