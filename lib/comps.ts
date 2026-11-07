// Comparable listings + predicted price from MarketCheck. Live responses are
// cached for 24h per year/model/ZIP. With no MARKETCHECK_API_KEY, realistic
// mock comps are generated so the app keeps working.
//
// Endpoints (verify against MarketCheck's docs when the key arrives):
//   GET /v2/search/car/active            active used listings near a ZIP
//   GET /v2/predict/car/us/marketcheck_price   predicted price for a VIN

import { fetchJson, isOffline, type FetchLike } from "./http";
import { mockComps, mockPredictedPrice } from "./mocks/comps";
import type { Comp } from "./pricing";
import { getStore, type Store } from "./store";
import type { DataSource } from "./types";

const API = "https://mc-api.marketcheck.com/v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Fetch the widest window selectComps can use (year ±2, 200 mi). */
const SEARCH_RADIUS = 200;
const YEAR_SPREAD = 2;
const ROWS = 50;

type SearchResponse = {
  listings?: { price?: number; miles?: number; dist?: number; build?: { year?: number } }[];
};
type PredictResponse = { marketcheck_price?: number };

export type CompsQuery = { year: number; make: string; model: string; zip: string; mileage: number; vin?: string };

export type CompsResult = {
  pool: Comp[];
  predictedPrice: number | null;
  source: DataSource;
  /** MarketCheck calls actually made (0 when served from cache or mocks). */
  calls: number;
};

export function hasMarketCheck(): boolean {
  return !isOffline() && Boolean(process.env.MARKETCHECK_API_KEY);
}

export function compsCacheKey(q: { year: number; make: string; model: string; zip: string }): string {
  return `comps:${q.year}:${q.make}:${q.model}:${q.zip}`.toLowerCase().replace(/\s+/g, "-");
}

export function parseListings(json: SearchResponse): Comp[] {
  return (json.listings ?? [])
    .filter((l) => typeof l.price === "number" && l.price > 0)
    .map((l) => ({
      price: l.price!,
      ...(typeof l.build?.year === "number" ? { year: l.build.year } : {}),
      ...(typeof l.miles === "number" ? { mileage: l.miles } : {}),
      ...(typeof l.dist === "number" ? { distanceMiles: l.dist } : {}),
    }));
}

export async function getComps(
  q: CompsQuery,
  deps: { fetchImpl?: FetchLike; store?: Store } = {},
): Promise<CompsResult> {
  if (!hasMarketCheck()) {
    return { pool: mockComps(q), predictedPrice: mockPredictedPrice(q), source: "mock", calls: 0 };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const store = deps.store ?? getStore();
  const key = process.env.MARKETCHECK_API_KEY!;
  let calls = 0;

  const cacheKey = compsCacheKey(q);
  let pool = await store.getCache<Comp[]>(cacheKey);
  if (!pool) {
    const years = Array.from({ length: YEAR_SPREAD * 2 + 1 }, (_, i) => q.year - YEAR_SPREAD + i).join(",");
    const params = new URLSearchParams({
      api_key: key,
      year: years,
      make: q.make.toLowerCase(),
      model: q.model.toLowerCase(),
      zip: q.zip,
      radius: String(SEARCH_RADIUS),
      car_type: "used",
      rows: String(ROWS),
    });
    calls++;
    try {
      pool = parseListings(await fetchJson<SearchResponse>(`${API}/search/car/active?${params}`, fetchImpl));
      await store.setCache(cacheKey, pool, CACHE_TTL_MS);
    } catch (err) {
      console.error("[comps] MarketCheck search failed", err);
      pool = [];
    }
  }

  let predictedPrice: number | null = null;
  if (q.vin) {
    const params = new URLSearchParams({
      api_key: key,
      vin: q.vin,
      miles: String(q.mileage),
      zip: q.zip,
      dealer_type: "independent",
    });
    calls++;
    try {
      const json = await fetchJson<PredictResponse>(`${API}/predict/car/us/marketcheck_price?${params}`, fetchImpl);
      predictedPrice = typeof json.marketcheck_price === "number" ? Math.round(json.marketcheck_price) : null;
    } catch (err) {
      console.error("[comps] MarketCheck prediction failed", err);
    }
  }

  return { pool, predictedPrice, source: "live", calls };
}
