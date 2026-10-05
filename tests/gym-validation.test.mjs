import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMembershipEndDate,
  createMemberSchema,
  membershipAssignmentSchema,
  planSchema,
  updateMemberSchema,
} from "../lib/gym/validation.js";

test("membership plans accept custom durations and non-negative currency precision", () => {
  assert.equal(planSchema.safeParse({ name: "Strength 12-week", duration_days: "84", price: "1599.50", description: "" }).success, true);
  for (const input of [
    { name: "", duration_days: "30", price: "20" },
    { name: "No duration", duration_days: "0", price: "20" },
    { name: "Too long", duration_days: "3651", price: "20" },
    { name: "Negative", duration_days: "30", price: "-1" },
    { name: "Precision", duration_days: "30", price: "1.234" },
  ]) assert.equal(planSchema.safeParse(input).success, false);
});

test("new member validation requires contact, joining and membership dates", () => {
  const valid = {
    full_name: "Sample Member",
    phone: "+91 98765 43210",
    email: "sample@example.test",
    gender: "prefer_not_to_say",
    date_of_birth: "1998-02-28",
    address: "",
    joining_date: "2026-10-01",
    notes: "",
    membership_plan_id: "bbbbbbbb-0000-4000-8000-000000000001",
    membership_start_date: "2026-10-01",
  };
  assert.equal(createMemberSchema.safeParse(valid).success, true);
  assert.equal(createMemberSchema.safeParse({ ...valid, phone: "123" }).success, false);
  assert.equal(createMemberSchema.safeParse({ ...valid, email: "bad-email" }).success, false);
  assert.equal(createMemberSchema.safeParse({ ...valid, date_of_birth: "2025-02-29" }).success, false);
  assert.equal(createMemberSchema.safeParse({ ...valid, date_of_birth: "2026-10-02" }).success, false);
  assert.equal(createMemberSchema.safeParse({ ...valid, membership_start_date: "2026-09-30" }).success, false);
});

test("profile updates accept active/inactive only and reject invalid identifiers or names", () => {
  const valid = { id: "cccccccc-0000-4000-8000-000000000001", full_name: "Updated Member", phone: "", email: "", gender: "", date_of_birth: "", address: "", notes: "", status: "inactive" };
  assert.equal(updateMemberSchema.safeParse(valid).success, true);
  assert.equal(updateMemberSchema.safeParse({ ...valid, status: "archived" }).success, false);
  assert.equal(updateMemberSchema.safeParse({ ...valid, full_name: " " }).success, false);
});

test("membership expiry is calculated with calendar-day arithmetic in UTC", () => {
  assert.equal(calculateMembershipEndDate("2024-02-28", 1), "2024-02-29");
  assert.equal(calculateMembershipEndDate("2024-02-29", 30), "2024-03-30");
  assert.equal(calculateMembershipEndDate("2025-02-29", 30), null);
  assert.equal(calculateMembershipEndDate("2026-01-01", 0), null);
});

test("membership assignment requires valid member, plan and start date", () => {
  const input = { member_id: "cccccccc-0000-4000-8000-000000000001", membership_plan_id: "bbbbbbbb-0000-4000-8000-000000000001", start_date: "2026-10-01" };
  assert.equal(membershipAssignmentSchema.safeParse(input).success, true);
  assert.equal(membershipAssignmentSchema.safeParse({ ...input, start_date: "2026-02-30" }).success, false);
  assert.equal(membershipAssignmentSchema.safeParse({ ...input, member_id: "bad-id" }).success, false);
});
