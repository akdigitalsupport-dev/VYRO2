"use client";

import { useActionState } from "react";
import { saveExpenseAction } from "@/app/(gym)/gym/expenses/actions";
import type { FormActionState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: FormActionState = { status: "idle", message: "" };
export function ExpenseEditor({ today, item }: { today: string; item?: { id: string; expense_date: string; category: string; amount: number | string; description: string; reference: string | null; notes: string | null } }) {
  const [state, action, pending] = useActionState(saveExpenseAction, initial);
  return <form action={action} className="grid gap-3 rounded-lg border border-border/80 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
    {item ? <input type="hidden" name="id" value={item.id} /> : null}
    <div><Label htmlFor={`expense-date-${item?.id ?? "new"}`}>Date</Label><Input id={`expense-date-${item?.id ?? "new"}`} name="expense_date" type="date" defaultValue={item?.expense_date ?? today} required /></div>
    <div><Label htmlFor={`expense-category-${item?.id ?? "new"}`}>Category</Label><select id={`expense-category-${item?.id ?? "new"}`} name="category" defaultValue={item?.category ?? "rent"} className="h-10 w-full rounded-md border border-input bg-[#101512] px-3 text-sm">{["rent", "electricity", "equipment", "maintenance", "salary", "marketing", "other"].map((v) => <option key={v} value={v}>{v.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase())}</option>)}</select></div>
    <div><Label htmlFor={`expense-amount-${item?.id ?? "new"}`}>Amount</Label><Input id={`expense-amount-${item?.id ?? "new"}`} name="amount" type="number" min="0.01" step="0.01" defaultValue={item?.amount} required /></div>
    <div><Label htmlFor={`expense-description-${item?.id ?? "new"}`}>Description</Label><Input id={`expense-description-${item?.id ?? "new"}`} name="description" maxLength={240} defaultValue={item?.description} required /></div>
    <div><Label htmlFor={`expense-reference-${item?.id ?? "new"}`}>Reference</Label><Input id={`expense-reference-${item?.id ?? "new"}`} name="reference" maxLength={120} defaultValue={item?.reference ?? ""} /></div>
    <div className="sm:col-span-2"><Label htmlFor={`expense-notes-${item?.id ?? "new"}`}>Notes</Label><Textarea id={`expense-notes-${item?.id ?? "new"}`} name="notes" maxLength={1000} defaultValue={item?.notes ?? ""} className="min-h-10" /></div>
    <div className="flex items-end"><Button type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : "Add expense"}</Button></div>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`sm:col-span-4 text-sm ${state.status === "error" ? "text-destructive" : "text-positive"}`}>{state.message}</p> : null}
  </form>;
}
