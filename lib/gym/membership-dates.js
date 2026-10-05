export function calculateMembershipEndDate(startDate, durationDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return null;
  const end = new Date(Date.UTC(year, month - 1, day + durationDays));
  if (end.getUTCFullYear() > 9999) return null;
  return `${String(end.getUTCFullYear()).padStart(4, "0")}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
}
