export type AppRole = "platform_owner" | "gym_admin";

export function isActiveRole(role: unknown): role is AppRole;
export function canAccessRole(profileRole: unknown, requiredRole: AppRole): boolean;
export function workspacePath(profileRole: unknown, gymMembershipCount?: number): "/platform/dashboard" | "/gym/command-center" | null;
