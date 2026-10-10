"use client";

import { useState, useTransition } from "react";
import { loadNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { InAppNotification } from "@/lib/notifications/server";
import { PushNotificationToggle } from "@/components/shells/push-notification-toggle";

export function NotificationCenter({
  audience,
  notifications: initialNotifications = [],
  unreadCount: initialUnreadCount = 0,
  timeZone: initialTimeZone = "Asia/Kolkata",
  pushEnabled: initialPushEnabled = false,
  pushPublicKey = "",
}: {
  audience: "gym" | "platform";
  notifications?: InAppNotification[];
  unreadCount?: number;
  timeZone?: string;
  pushEnabled?: boolean;
  pushPublicKey?: string;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [timeZone, setTimeZone] = useState(initialTimeZone);
  const [pushEnabled, setPushEnabled] = useState(initialPushEnabled);
  const [loaded, setLoaded] = useState(initialNotifications.length > 0);
  const [error, setError] = useState("");
  const [loading, startLoading] = useTransition();

  function handleToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    if (!event.currentTarget.open || loaded || loading) return;
    startLoading(async () => {
      setError("");
      try {
        const result = await loadNotifications(audience);
        if (result.error) {
          setError("Notifications could not be loaded. Try again.");
          return;
        }
        setNotifications(result.notifications);
        setUnreadCount(result.unreadCount);
        setTimeZone(result.timeZone);
        setPushEnabled(result.pushEnabled);
        setLoaded(true);
      } catch {
        setError("Notifications could not be loaded. Try again.");
      }
    });
  }

  return (
    <details className="notification-center" onToggle={handleToggle}>
      <summary aria-label={`${unreadCount} unread notifications`} title="Notifications">
        <span aria-hidden="true">♢</span>
        <span className="notification-label">Notifications</span>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </summary>
      <section className="notification-popover" aria-label="In-app notifications">
        <div className="notification-heading">
          <strong>Notifications</strong>
          {unreadCount > 0 && (
            <form action={markAllNotificationsRead} onSubmit={() => {
              setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
              setUnreadCount(0);
            }}>
              <input type="hidden" name="audience" value={audience} />
              <button className="notification-action" type="submit">Mark all read</button>
            </form>
          )}
        </div>
        {loading ? <p className="notification-empty">Loading notifications…</p> : null}
        {error ? <p className="notification-empty" role="alert">{error}</p> : null}
        {!loading && !error && notifications.length === 0 ? <p className="notification-empty">You’re all caught up.</p> : null}
        {!loading && !error && notifications.length > 0 ? (
          <ul>
            {notifications.map((notification) => (
              <li key={notification.id} className={notification.is_read ? "is-read" : "is-unread"}>
                <div>
                  <strong>{notification.title}</strong>
                  <p>{notification.message}</p>
                  <time dateTime={notification.created_at}>
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(notification.created_at))}
                  </time>
                </div>
                {!notification.is_read && (
                  <form action={markNotificationRead} onSubmit={() => {
                    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
                    setUnreadCount((count) => Math.max(0, count - 1));
                  }}>
                    <input type="hidden" name="audience" value={audience} />
                    <input type="hidden" name="id" value={notification.id} />
                    <button className="notification-action" type="submit" aria-label={`Mark ${notification.title} as read`}>Mark read</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {audience === "gym" ? <PushNotificationToggle publicKey={pushPublicKey} initialEnabled={pushEnabled} /> : null}
      </section>
    </details>
  );
}
