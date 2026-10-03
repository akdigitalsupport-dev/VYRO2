const dateParts = (value: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
};

export function isValidTimeZone(timeZone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone }); return true; } catch { return false; }
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDateInTimeZone(timeZone: string, now = new Date()) {
  const parts = dateParts(now, timeZone);
  return parts.year + "-" + parts.month + "-" + parts.day;
}

export function localMidnightAsUtc(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let result = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = dateParts(new Date(result), timeZone);
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    result += targetAsUtc - localAsUtc;
  }
  return new Date(result);
}

export function addIsoDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.getUTCFullYear() + "-" + String(value.getUTCMonth() + 1).padStart(2, "0") + "-" + String(value.getUTCDate()).padStart(2, "0");
}
