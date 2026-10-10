import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationCenter } from "@/components/notification-center";

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
