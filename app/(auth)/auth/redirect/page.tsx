import { redirect } from "next/navigation";
import { getAuthenticatedHomePath } from "@/lib/auth/guards";

export default async function AuthRedirectPage() {
  redirect(await getAuthenticatedHomePath());
}
