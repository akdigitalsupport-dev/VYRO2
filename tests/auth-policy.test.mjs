import test from "node:test";
import assert from "node:assert/strict";
import policy from "../lib/auth/policy.js";

const { canAccessRole, isActiveRole, workspacePath } = policy;

test("platform owners route to the platform workspace and cannot enter the gym workspace", () => {
  assert.equal(workspacePath("platform_owner"), "/platform/dashboard");
  assert.equal(canAccessRole("platform_owner", "platform_owner"), true);
  assert.equal(canAccessRole("platform_owner", "gym_admin"), false);
});

test("gym admins route to their gym workspace and cannot enter platform routes", () => {
  assert.equal(workspacePath("gym_admin", 1), "/gym/command-center");
  assert.equal(canAccessRole("gym_admin", "gym_admin"), true);
  assert.equal(canAccessRole("gym_admin", "platform_owner"), false);
});

test("accounts without exactly one gym membership receive no gym workspace", () => {
  assert.equal(workspacePath("gym_admin"), null);
  assert.equal(workspacePath("gym_admin", 0), null);
  assert.equal(workspacePath("gym_admin", 2), null);
});

test("future and unknown roles are not active application roles", () => {
  for (const role of ["trainer", "receptionist", "member", "owner", null, undefined]) {
    assert.equal(isActiveRole(role), false);
    assert.equal(workspacePath(role), null);
    assert.equal(canAccessRole(role, "platform_owner"), false);
  }
});
