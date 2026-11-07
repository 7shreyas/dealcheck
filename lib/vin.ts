// VIN decode via NHTSA vPIC (free, no key). Returns null, never throws, on an
// invalid VIN or an API error.

import { fetchJson, isOffline, type FetchLike } from "./http";
import { mockVin } from "./mocks/nhtsa";
import type { VinInfo } from "./types";

type VpicResponse = {
  Results?: { ModelYear?: string; Make?: string; Model?: string; Trim?: string; ErrorCode?: string }[];
};

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

/** "HONDA" → "Honda", "MERCEDES-BENZ" → "Mercedes-Benz". Leaves mixed case alone. */
export function tidyName(s: string): string {
  if (s !== s.toUpperCase() || s.length <= 3) return s;
  return s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}

export function parseVpic(json: VpicResponse): VinInfo | null {
  const r = json.Results?.[0];
  const year = Number(r?.ModelYear);
  const make = r?.Make?.trim();
  const model = r?.Model?.trim();
  if (!r || !Number.isInteger(year) || year < 1980 || !make || !model) return null;
  const trim = r.Trim?.trim();
  return { year, make: tidyName(make), model, ...(trim ? { trim } : {}) };
}

export async function decodeVin(vin: string, fetchImpl: FetchLike = fetch): Promise<VinInfo | null> {
  const clean = vin.trim().toUpperCase();
  if (!VIN_RE.test(clean)) return null;
  if (isOffline()) return mockVin(clean);
  try {
    const json = await fetchJson<VpicResponse>(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${clean}?format=json`,
      fetchImpl,
    );
    return parseVpic(json);
  } catch (err) {
    console.error("[vin] decode failed", err);
    return null;
  }
}
