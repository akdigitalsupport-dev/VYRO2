"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateMemberPhotoAction } from "@/app/(gym)/gym/members/actions";
import { MemberPhotoPicker } from "@/components/members/member-photo-picker";
import { Button } from "@/components/ui/button";
import { initialFormActionState } from "@/lib/forms";

export function MemberPhotoControls({
  memberId,
  memberName,
  photoUrl,
}: {
  memberId: string;
  memberName: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const action = updateMemberPhotoAction.bind(null, memberId);
  const [state, formAction, pending] = useActionState(action, initialFormActionState);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="space-y-4">
      <MemberPhotoPicker memberName={memberName} initialPhotoUrl={photoUrl} />
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-danger" : "text-sm text-positive"}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving photo…" : "Save photo changes"}</Button>
    </form>
  );
}
