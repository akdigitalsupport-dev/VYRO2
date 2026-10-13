import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicCheckInForm } from "@/components/attendance/public-check-in-form";
import { GymCheckinQrManager } from "@/components/attendance/gym-checkin-qr-manager";

const { generateAction } = vi.hoisted(() => ({ generateAction: vi.fn() }));
vi.mock("@/app/(gym)/gym/attendance/qr-actions", () => ({ generateGymCheckinCodesAction: generateAction }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  generateAction.mockResolvedValue({ status: "idle", message: "" });
});

describe("public QR check-in page", () => {
  it("asks only for the four-digit Member ID and supports a phone number pad", () => {
    render(<PublicCheckInForm gymId="e4d63723-afce-4ec0-bac0-bc98f07555d5" />);
    expect(screen.getByLabelText("4-digit Member ID")).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByLabelText("4-digit Member ID")).toHaveAttribute("maxLength", "4");
    expect(screen.queryByLabelText(/pin|password|otp/i)).not.toBeInTheDocument();
    expect(screen.getByText("No account, password, or PIN needed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check In" })).toBeDisabled();
  });

  it("submits the member ID and shows one generic failure for an unsuccessful request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    render(<PublicCheckInForm gymId="e4d63723-afce-4ec0-bac0-bc98f07555d5" />);
    const input = screen.getByLabelText("4-digit Member ID");
    fireEvent.change(input, { target: { value: "00a73" } });
    expect(input).toHaveValue("0073");
    fireEvent.click(screen.getByRole("button", { name: "Check In" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/check-in", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ gymId: "e4d63723-afce-4ec0-bac0-bc98f07555d5", memberId: "0073" }),
    })));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't check you in. Check your 4-digit Member ID or ask gym staff.");
  });

  it("builds the downloadable QR from the permanent production URL", () => {
    render(<GymCheckinQrManager gymId="e4d63723-afce-4ec0-bac0-bc98f07555d5" gymName="Northside Fitness" activeMembers={5} assignedCodes={0} codesReady={false} />);
    expect(screen.getByText("https://vyro-2-two.vercel.app/check-in/e4d63723-afce-4ec0-bac0-bc98f07555d5")).toBeInTheDocument();
    expect(screen.getByLabelText("Northside Fitness permanent check-in QR code")).toBeInTheDocument();
    expect(screen.getByText("0 of 5 active members have an ID.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download member IDs" })).not.toBeInTheDocument();
  });
});
