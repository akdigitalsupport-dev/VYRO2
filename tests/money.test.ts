import { describe, expect, it } from "vitest";
import { formatInr, paiseToRupees, rupeesToPaise } from "@/lib/money";

describe("formatInr", () => {
  it("formats Indian grouping", () => {
    expect(formatInr(184500)).toBe("₹1,84,500");
  });

  it("converts paise without floating error for whole rupees", () => {
    expect(rupeesToPaise(1499)).toBe(149900);
    expect(paiseToRupees(149900)).toBe(1499);
  });
});
