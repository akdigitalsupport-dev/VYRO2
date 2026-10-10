"use client";

import { useState, useTransition } from "react";
import { BellRing, BellOff } from "lucide-react";
import { saveGymPushSubscription, removeGymPushSubscription } from "@/app/(gym)/gym/push-actions";
import { Button } from "@/components/ui/button";

function decodeApplicationKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function PushNotificationToggle({ publicKey, initialEnabled }: { publicKey: string; initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const enable = () => startTransition(async () => {
    setMessage("");
    if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !window.isSecureContext) {
      setMessage("Browser push requires a configured public VAPID key and a secure HTTPS page.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(permission === "denied" ? "Allow notifications for this site in your browser settings, then try again." : "Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationKey(publicKey),
      });
      const result = await saveGymPushSubscription(subscription.toJSON());
      if (!result.ok) {
        await subscription.unsubscribe();
        setMessage(result.message ?? "This device could not be registered.");
        return;
      }
      setEnabled(true);
      setMessage("Browser notifications are enabled for this device.");
    } catch {
      setMessage("Browser notifications could not be enabled. Check the site permission and try again.");
    }
  });

  const disable = () => startTransition(async () => {
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const result = await removeGymPushSubscription(subscription.endpoint);
        if (!result.ok) {
          setMessage(result.message ?? "This device could not be removed.");
          return;
        }
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Browser notifications are disabled for this device.");
    } catch {
      setMessage("This device could not be removed from notifications.");
    }
  });

  return <div className="border-t border-border/70 pt-3">
    <p className="mb-2 text-xs text-muted-foreground">Browser notifications are stored for this account and device only.</p>
    <Button type="button" size="sm" variant="secondary" disabled={pending || (!publicKey && !enabled)} onClick={enabled ? disable : enable}>
      {enabled ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
      {pending ? "Updating…" : enabled ? "Disable on this device" : publicKey ? "Enable on this device" : "Push setup unavailable"}
    </Button>
    {message ? <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
  </div>;
}
