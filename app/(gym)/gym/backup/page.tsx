import type { Metadata } from "next";
import { BackupManager } from "@/components/backup/backup-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requireGymAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Backup and restore" };

export default async function BackupPage() {
  await requireGymAdmin();
  return <div className="mx-auto max-w-4xl space-y-6"><PageHeader eyebrow="Data tools" title="Backup and restore" description="Create one VYRO file or restore a verified backup for this gym."/><BackupManager/></div>;
}
