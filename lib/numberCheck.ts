// The model may only quote dollar figures we gave it. findUnverifiedNumbers
// returns every $ figure in the output that isn't in the allowed list.

const PRODUCT_PRICE = 29;

const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(k)?\b/gi;

export function findUnverifiedNumbers(output: string, allowed: number[]): string[] {
  const ok = new Set([...allowed, PRODUCT_PRICE]);
  const bad: string[] = [];
  for (const m of output.matchAll(DOLLAR_RE)) {
    const value = Number(m[1].replace(/,/g, "")) * (m[3] ? 1000 : 1);
    if (!ok.has(value)) bad.push(m[0]);
  }
  return bad;
}
