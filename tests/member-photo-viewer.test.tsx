import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemberPhotoViewer } from "@/components/members/member-photo-viewer";

afterEach(cleanup);

describe("member photo viewer", () => {
  it("opens the signed photo in an in-app dialog and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <MemberPhotoViewer src="https://storage.example/signed-photo.jpg" alt="A member photo">
        <span>Photo thumbnail</span>
      </MemberPhotoViewer>,
    );

    await user.click(screen.getByRole("button", { name: "View A member photo" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A member photo" })).toHaveAttribute(
      "src",
      "https://storage.example/signed-photo.jpg",
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(
      <MemberPhotoViewer src="https://storage.example/signed-photo.png" alt="Member portrait">
        <span>Photo thumbnail</span>
      </MemberPhotoViewer>,
    );

    await user.click(screen.getByRole("button", { name: "View Member portrait" }));
    const overlay = document.querySelector("[data-state='open']");
    expect(overlay).toBeTruthy();
    fireEvent.pointerDown(overlay!);
    fireEvent.click(overlay!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a missing-photo fallback non-interactive", () => {
    render(
      <MemberPhotoViewer src={null} alt="Member portrait">
        <span>AB</span>
      </MemberPhotoViewer>,
    );

    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
