import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationCenter, notificationHref } from "@/components/notification-center";

afterEach(cleanup);

const notifications = [{
  id: "notification-1",
  audience: "platform" as const,
  notification_type: "member_added",
  title: "New member added",
  message: "A new member was added to your gym.",
  entity_type: null,
  entity_id: null,
  is_read: false,
  created_at: "2026-10-10T10:10:00.000Z",
}];

function renderNotificationCenter() {
  return render(
    <>
      <NotificationCenter audience="platform" notifications={notifications} unreadCount={1} />
      <button type="button">Outside</button>
    </>,
  );
}

describe("notification destination routing", () => {
  it("opens membership reminders in the matching filtered member list", () => {
    expect(notificationHref("gym", "membership_expiring")).toBe("/gym/members?membership_status=expiring");
    expect(notificationHref("gym", "membership_expiry_reminder")).toBe("/gym/members?membership_status=expiring");
    expect(notificationHref("gym", "membership_expired")).toBe("/gym/members?membership_status=expired");
  });

  it("opens payment and SaaS subscription notifications in their relevant sections", () => {
    expect(notificationHref("gym", "payment_recorded")).toBe("/gym/members/billing");
    expect(notificationHref("gym", "payment_refunded")).toBe("/gym/members/billing");
    expect(notificationHref("platform", "gym_subscription_expiring")).toBe("/platform/subscriptions");
    expect(notificationHref("platform", "platform_payment_refunded")).toBe("/platform/revenue/payments");
  });

  it("falls back to the correct workspace for unknown notification types", () => {
    expect(notificationHref("gym", "unknown")).toBe("/gym/command-center");
    expect(notificationHref("platform", "unknown")).toBe("/platform");
  });
});

describe("notification center popover", () => {
  it("shows the notification in the disclosure and closes with Escape", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();
    const details = document.querySelector(".notification-center")!;

    await user.click(screen.getByTitle("Notifications"));

    expect(details).toHaveAttribute("open");
    expect(screen.getByText("New member added")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(details).not.toHaveAttribute("open");
  });

  it("closes when a pointer interaction happens outside the panel", async () => {
    const user = userEvent.setup();
    renderNotificationCenter();
    const details = document.querySelector(".notification-center")!;

    await user.click(screen.getByTitle("Notifications"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));

    expect(details).not.toHaveAttribute("open");
  });
});
