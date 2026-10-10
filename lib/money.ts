/**
 * Display helper for Indian Rupees.
 * Domain amounts will be stored as integer paise in later phases.
 */
export function formatInr(rupees: number, options?: { fractionDigits?: number }) {
  const fractionDigits = options?.fractionDigits ?? 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rupees);
}

export function paiseToRupees(paise: number) {
  return paise / 100;
}

export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}
