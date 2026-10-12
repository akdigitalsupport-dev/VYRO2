import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { InteractiveTrendChart, type TrendPoint } from "@/components/dashboard/interactive-trend-chart";

afterEach(cleanup);

const income: TrendPoint[] = Array.from({ length: 30 }, (_, index) => ({
  date: "2026-09-" + String(index + 1).padStart(2, "0"),
  value: (index + 1) * 100,
}));

const attendance: TrendPoint[] = Array.from({ length: 30 }, (_, index) => ({
  date: "2026-09-" + String(index + 1).padStart(2, "0"),
  value: index + 10,
}));

function renderChart() {
  return render(<InteractiveTrendChart income={income} attendance={attendance} currency="INR" />);
}

describe("interactive trend chart", () => {
  it("starts on income with a selectable 14-day range", () => {
    renderChart();
    expect(screen.getByText("Daily income")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: /Daily income chart for the last 14 days/ })).toBeInTheDocument();
  });

  it("switches between income and attendance without another data request", async () => {
    const user = userEvent.setup();
    renderChart();
    await user.click(screen.getByRole("button", { name: "Attendance" }));
    expect(screen.getByText("Attendance check-ins")).toBeInTheDocument();
    expect(screen.getByText("39")).toBeInTheDocument();
    const chart = screen.getByRole("group", { name: /Attendance check-ins chart for the last 14 days/ });
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByText("38")).toBeInTheDocument();
  });

  it("changes to 7 and 30 days while keeping the chart keyboard accessible", async () => {
    const user = userEvent.setup();
    renderChart();
    await user.click(screen.getByRole("button", { name: "7 days" }));
    expect(screen.getByRole("group", { name: /Daily income chart for the last 7 days/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByRole("group", { name: /Daily income chart for the last 30 days/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a truthful zero-state note instead of fabricated activity", () => {
    render(<InteractiveTrendChart income={income.map((point) => ({ ...point, value: 0 }))} attendance={attendance.map((point) => ({ ...point, value: 0 }))} currency="INR" />);
    expect(screen.getByText(/No recorded income in this period yet/)).toBeInTheDocument();
  });
});
