const activeRoles = new Set(["platform_owner", "gym_admin"]);

function isActiveRole(role) {
  return typeof role === "string" && activeRoles.has(role);
}

function canAccessRole(profileRole, requiredRole) {
  return isActiveRole(profileRole) && profileRole === requiredRole;
}

function workspacePath(profileRole, gymMembershipCount = 0) {
  if (profileRole === "platform_owner") return "/platform/dashboard";
  if (profileRole === "gym_admin" && gymMembershipCount === 1) return "/gym/command-center";
  return null;
}

module.exports = { isActiveRole, canAccessRole, workspacePath };
