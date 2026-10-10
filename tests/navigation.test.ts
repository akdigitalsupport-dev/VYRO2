import { describe, expect, it } from "vitest";
import { gymNav } from "@/lib/navigation/gym";
import { flattenNav, platformNav } from "@/lib/navigation/platform";

describe("experience isolation", () => {
  it("does not mix platform and gym routes", () => {
    const platformHrefs = flattenNav(platformNav).map((item) => item.href);
    const gymHrefs = flattenNav(gymNav).map((item) => item.href);

    expect(platformHrefs.every((href) => href.startsWith("/platform"))).toBe(true);
    expect(gymHrefs.every((href) => href.startsWith("/gym"))).toBe(true);
    expect(platformHrefs.some((href) => gymHrefs.includes(href))).toBe(false);
  });

  it("matches the gym operating navigation and keeps billing inside Members", () => {
    expect(flattenNav(gymNav).map((item) => item.label)).toEqual(["Dashboard", "Members", "Plans", "Attendance", "Trainers", "Expenses", "Reports", "Backup", "Settings"]);
    expect(flattenNav(gymNav).some((item) => ["Memberships", "Payments"].includes(item.label))).toBe(false);
  });

  it("keeps navigation icon data serializable across the server/client boundary", () => {
    for (const item of [...flattenNav(platformNav), ...flattenNav(gymNav)]) {
      expect(typeof item.icon).toBe("string");
    }

    expect(() => JSON.stringify({ platformNav, gymNav })).not.toThrow();
  });
});
