"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui";

export function Dialog({ trigger, title, children }: { trigger: string; title: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <Button type="button" onClick={() => dialogRef.current?.showModal()}>{trigger}</Button>
      <dialog ref={dialogRef} className="ui-dialog" aria-labelledby={titleId}>
        <div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2><Button type="button" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>×</Button></div>
        <div className="ui-dialog-body">{children}</div>
      </dialog>
    </>
  );
}
