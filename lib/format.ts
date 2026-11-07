const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const INT = new Intl.NumberFormat("en-US");

/** 12300 → "$12,300" (no cents). */
export const usd = (n: number) => USD.format(Math.round(n));
export const int = (n: number) => INT.format(Math.round(n));

export function carName(c: { year: number; make: string; model: string; trim?: string }): string {
  return `${c.year} ${c.make} ${c.model}${c.trim ? ` ${c.trim}` : ""}`;
}
