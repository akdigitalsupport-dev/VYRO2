import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "Gym trials" };

export default async function GymTrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="trial" searchQuery={q} title="Gym Trials" description="Customer gym workspaces currently on a VYRO free-trial subscription." />;
}
