import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Start trial" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Start a trial"
      description="Public signup is unavailable while VYRO onboarding is being finalized."
    >
      <form className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gym">Gym name</Label>
          <Input id="gym" name="gym" required />
        </div>
        <p className="text-sm text-muted-foreground">Account creation is not available yet. Contact your VYRO administrator for access.</p>
        <Button type="submit" className="w-full" disabled>
          Continue
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already have access?{" "}
        <Link className="text-foreground underline-offset-4 hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
