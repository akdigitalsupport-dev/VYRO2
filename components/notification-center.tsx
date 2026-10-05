"use client";

import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/actions";
import type { InAppNotification } from "@/lib/notifications/server";

export function NotificationCenter({ audience, notifications, unreadCount, timeZone = "Asia/Kolkata" }: {
  audience: "gym" | "platform";
  notifications: InAppNotification[];
  unreadCount: number;
  timeZone?: string;
}) {
  return <details className="notification-center">
    <summary aria-label={`${unreadCount} unread notifications`} title="Notifications">
      <span aria-hidden="true">♢</span><span className="notification-label">Notifications</span>
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </summary>
    <section className="notification-popover" aria-label="In-app notifications">
      <div className="notification-heading"><strong>Notifications</strong>{unreadCount > 0 && <form action={markAllNotificationsRead}><input type="hidden" name="audience" value={audience} /><button className="notification-action" type="submit">Mark all read</button></form>}</div>
      {notifications.length === 0 ? <p className="notification-empty">You’re all caught up.</p> : <ul>{notifications.map((notification) => <li key={notification.id} className={notification.is_read ? "is-read" : "is-unread"}>
        <div><strong>{notification.title}</strong><p>{notification.message}</p><time dateTime={notification.created_at}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(notification.created_at))}</time></div>
        {!notification.is_read && <form action={markNotificationRead}><input type="hidden" name="audience" value={audience} /><input type="hidden" name="id" value={notification.id} /><button className="notification-action" type="submit" aria-label={`Mark ${notification.title} as read`}>Mark read</button></form>}
      </li>)}</ul>}
    </section>
  </details>;
}
