import type { Metadata } from "next";
import { GymDirectory } from "@/components/platform/gym-directory";

export const metadata: Metadata = { title: "Trial programs" };

export default async function PlatformTrialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  return <GymDirectory filter="trial" searchQuery={q} title="Trial Programs" description="Review gym accounts using trial subscriptions and their configured expiry dates." />;
}
