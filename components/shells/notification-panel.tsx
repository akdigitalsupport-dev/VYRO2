"use client";

import { useState, useTransition } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAllGymNotificationsRead, markGymNotificationRead } from "@/app/(gym)/gym/notification-actions";
import { PushNotificationToggle } from "@/components/shells/push-notification-toggle";

export type GymNotification = { id: string; title: string; message: string; created_at: string; is_read: boolean };

export function NotificationPanel({ initialNotifications, pushEnabled = false, pushPublicKey = "" }: { initialNotifications: GymNotification[]; pushEnabled?: boolean; pushPublicKey?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialNotifications);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.is_read).length;
  const readOne = (id: string) => startTransition(async () => {
    setActionError("");
    try { await markGymNotificationRead(id); setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item)); }
    catch { setActionError("Notification could not be marked as read. Refresh and try again."); }
  });
  const readAll = () => startTransition(async () => {
    setActionError("");
    try { await markAllGymNotificationsRead(); setItems((current) => current.map((item) => ({ ...item, is_read: true }))); }
    catch { setActionError("Notifications could not be marked as read. Refresh and try again."); }
  });
  return <div className="relative">
    <Button type="button" size="icon" variant="ghost" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
      <Bell className="h-4 w-4" />{unread ? <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground">{unread > 9 ? "9+" : unread}</span> : null}
    </Button>
    {open ? <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="font-display text-sm font-semibold">Notifications</h2><Button type="button" variant="ghost" size="sm" disabled={!unread || pending} onClick={readAll}><CheckCheck className="h-3.5 w-3.5" />Mark all read</Button></div>
      {items.length ? <ul className="max-h-[60vh] space-y-1 overflow-y-auto">{items.map((item) => <li key={item.id} className={`rounded-md p-2.5 ${item.is_read ? "opacity-65" : "bg-elevated/70"}`}>
        <button type="button" className="block w-full text-left" disabled={item.is_read || pending} onClick={() => readOne(item.id)}><span className="flex items-center justify-between gap-2 text-sm font-medium">{item.title}{!item.is_read ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.message}</span><time className="mt-1 block text-[10px] text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time></button>
      </li>)}</ul> : <p className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">No notifications yet.</p>}
      {actionError ? <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p> : null}
      <PushNotificationToggle publicKey={pushPublicKey} initialEnabled={pushEnabled} />
    </div> : null}
  </div>;
}
