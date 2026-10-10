import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <AuthShell title="Access unavailable" description="This account does not have access to that workspace.">
      <Button asChild className="w-full" variant="secondary">
        <Link href="/">Return to VYRO</Link>
      </Button>
    </AuthShell>
  );
}
