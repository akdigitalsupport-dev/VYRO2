"use client";

import { useTransition, useState } from "react";
import { archiveExpenseAction } from "@/app/(gym)/gym/expenses/actions";
import { ExpenseEditor } from "@/components/expenses/expense-editor";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = { id: string; expense_date: string; category: string; amount: string | number; description: string; reference: string | null; notes: string | null };
export function ExpenseRows({ rows, currency }: { rows: Row[]; currency: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const archive = (id: string) => {
    if (!window.confirm("Archive this expense? It will be excluded from totals and reports.")) return;
    startTransition(async () => { const result = await archiveExpenseAction(id); setMessage(result.message); });
  };
  if (!rows.length) return <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No expenses match this period or filter.</p>;
  return <div className="space-y-2"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>Amount</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.expense_date}</TableCell><TableCell className="capitalize">{row.category}</TableCell><TableCell>{row.description}</TableCell><TableCell>{row.reference || "—"}</TableCell><TableCell className="whitespace-nowrap">{new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(row.amount))}</TableCell><TableCell><details className="relative"><summary className="cursor-pointer text-accent">Edit</summary><div className="absolute right-0 z-20 mt-2 w-[min(56rem,calc(100vw-3rem))] rounded-lg border border-border bg-background p-3 shadow-xl"><ExpenseEditor today={row.expense_date} item={row} /></div></details><Button className="ml-2" type="button" size="sm" variant="ghost" disabled={pending} onClick={() => archive(row.id)}>Archive</Button></TableCell></TableRow>)}</TableBody></Table>{message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}</div>;
}
