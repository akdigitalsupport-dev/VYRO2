import type { Metadata } from "next";
import { ModulePage } from "@/components/shells/module-page";

export const metadata: Metadata = { title: "Trials" };

export default function Page() {
  return (
    <ModulePage
      kicker="Gyms"
      title="Trials"
      description="Gyms currently on a VYRO trial. SaaS trial state is separate from gym member trials."
    />
  );
}
