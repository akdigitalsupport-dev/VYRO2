"use client";

import { useFormStatus } from "react-dom";

export function AttendanceSubmitButton({ children, pendingLabel, disabled = false }: { children: string; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending || disabled} aria-live="polite">
    {pending ? pendingLabel : children}
  </button>;
}

export function AttendanceFilterButton() {
  const { pending } = useFormStatus();
  return <button className="button" type="submit" disabled={pending} aria-live="polite">
    {pending ? "Loading…" : "Apply filters"}
  </button>;
}
