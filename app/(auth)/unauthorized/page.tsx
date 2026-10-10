import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const limitedWorkspace = reason === "workspace" || reason === "subscription";
  return (
    <AuthShell
      title={limitedWorkspace ? "Workspace access unavailable" : "Access unavailable"}
      description={
        reason === "workspace"
          ? "This gym workspace is suspended or expired. Contact the VYRO platform administrator if you believe this is a mistake."
          : reason === "subscription"
            ? "This gym's VYRO subscription is suspended, expired, cancelled, or past its expiry date. Contact the platform administrator to review the subscription."
            : "This account does not have access to that workspace."
      }
    >
      <Button asChild className="w-full" variant="secondary">
        <Link href="/">Return to VYRO</Link>
      </Button>
    </AuthShell>
  );
}
