import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compsCacheKey, getComps, parseListings } from "../lib/comps";
import { MARKETCHECK_SEARCH_FIXTURE } from "../lib/mocks/comps";
import { COMPLAINTS_FIXTURE, RECALLS_FIXTURE, VPIC_FIXTURE, VPIC_INVALID_FIXTURE } from "../lib/mocks/nhtsa";
import { getRecalls, parseComplaints, parseRecalls } from "../lib/recalls";
import { MemoryStore } from "../lib/store";
import { decodeVin, parseVpic, tidyName } from "../lib/vin";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const CIVIC = { year: 2017, make: "Honda", model: "Civic", zip: "48104", mileage: 84000 };

beforeEach(() => {
  vi.stubEnv("MARKETCHECK_API_KEY", "");
  vi.stubEnv("DEALCHECK_OFFLINE", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("VIN decode (NHTSA vPIC)", () => {
  it("parses a vPIC fixture into { year, make, model, trim }", async () => {
    const f = vi.fn().mockResolvedValue(json(VPIC_FIXTURE));
    expect(await decodeVin("2HGFC2F79HH512345", f)).toEqual({ year: 2017, make: "Honda", model: "Civic", trim: "EX" });
    expect(String(f.mock.calls[0][0])).toContain("DecodeVinValues/2HGFC2F79HH512345?format=json");
  });

  it("returns null without calling the API for a malformed VIN", async () => {
    const f = vi.fn();
    expect(await decodeVin("NOT-A-VIN", f)).toBeNull();
    expect(await decodeVin("2HGFC2F79HH51234O", f)).toBeNull(); // contains O
    expect(f).not.toHaveBeenCalled();
  });

  it("returns null when vPIC can't decode the VIN", async () => {
    const f = vi.fn().mockResolvedValue(json(VPIC_INVALID_FIXTURE));
    expect(await decodeVin("1HGCM82633A004352", f)).toBeNull();
  });

  it("returns null (doesn't throw) on an API error", async () => {
    expect(await decodeVin("2HGFC2F79HH512345", vi.fn().mockResolvedValue(json({}, 500)))).toBeNull();
    expect(await decodeVin("2HGFC2F79HH512345", vi.fn().mockRejectedValue(new Error("network")))).toBeNull();
  });

  it("tidies all-caps names", () => {
    expect(tidyName("HONDA")).toBe("Honda");
    expect(tidyName("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(tidyName("BMW")).toBe("BMW");
    expect(parseVpic({})).toBeNull();
  });
});

describe("MarketCheck comps", () => {
  it("maps a search response to Comp[] with price, year, mileage and distance", () => {
    expect(parseListings(MARKETCHECK_SEARCH_FIXTURE)).toEqual([
      { price: 12995, year: 2017, mileage: 78200, distanceMiles: 12.4 },
      { price: 13450, year: 2017, mileage: 71050, distanceMiles: 33.1 },
      { price: 11900, year: 2016, mileage: 92300, distanceMiles: 48.7 },
      { price: 14200, year: 2018, mileage: 66400, distanceMiles: 61.0 },
      { price: 12500, year: 2017, mileage: 88900, distanceMiles: 87.5 },
    ]);
  });

  it("serves a second call for the same year/model/ZIP from the 24h cache (one fetch)", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "mc_test");
    const store = new MemoryStore();
    const f = vi.fn().mockImplementation(async () => json(MARKETCHECK_SEARCH_FIXTURE));

    const first = await getComps(CIVIC, { fetchImpl: f, store });
    const second = await getComps({ ...CIVIC, mileage: 60000 }, { fetchImpl: f, store });

    expect(f).toHaveBeenCalledTimes(1);
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(0);
    expect(second.pool).toEqual(first.pool);
    expect(first.source).toBe("live");
    const url = new URL(String(f.mock.calls[0][0]));
    expect(url.pathname).toBe("/v2/search/car/active");
    expect(url.searchParams.get("year")).toBe("2015,2016,2017,2018,2019");
    expect(url.searchParams.get("zip")).toBe("48104");
  });

  it("expires the cache after 24 hours", async () => {
    vi.useFakeTimers();
    vi.stubEnv("MARKETCHECK_API_KEY", "mc_test");
    const store = new MemoryStore();
    const f = vi.fn().mockImplementation(async () => json(MARKETCHECK_SEARCH_FIXTURE));
    await getComps(CIVIC, { fetchImpl: f, store });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    await getComps(CIVIC, { fetchImpl: f, store });
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("keys the cache by year, model and ZIP", () => {
    expect(compsCacheKey(CIVIC)).toBe("comps:2017:honda:civic:48104");
    expect(compsCacheKey({ ...CIVIC, model: "CR V" })).toBe("comps:2017:honda:cr-v:48104");
  });

  it("asks for a predicted price only when there's a VIN", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "mc_test");
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(MARKETCHECK_SEARCH_FIXTURE))
      .mockResolvedValueOnce(json({ marketcheck_price: 12640.4 }));
    const r = await getComps({ ...CIVIC, vin: "2HGFC2F79HH512345" }, { fetchImpl: f, store: new MemoryStore() });
    expect(r.predictedPrice).toBe(12640);
    expect(r.calls).toBe(2);
    expect(String(f.mock.calls[1][0])).toContain("/predict/car/us/marketcheck_price");
  });

  it("returns an empty pool, not a crash, when MarketCheck errors", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "mc_test");
    const r = await getComps(CIVIC, { fetchImpl: vi.fn().mockResolvedValue(json({}, 503)), store: new MemoryStore() });
    expect(r.pool).toEqual([]);
  });

  it("uses mock fixtures with no MARKETCHECK_API_KEY, and the app keeps working", async () => {
    const f = vi.fn();
    const r = await getComps(CIVIC, { fetchImpl: f, store: new MemoryStore() });
    expect(f).not.toHaveBeenCalled();
    expect(r.source).toBe("mock");
    expect(r.calls).toBe(0);
    expect(r.pool.length).toBeGreaterThanOrEqual(5);
    expect(r.pool.every((c) => c.price > 0 && c.year && c.mileage && c.distanceMiles !== undefined)).toBe(true);
    // Deterministic: the same car gives the same comps.
    expect((await getComps(CIVIC, { store: new MemoryStore() })).pool).toEqual(r.pool);
  });
});

describe("NHTSA recalls and complaints", () => {
  it("parses recall and complaint fixtures", () => {
    expect(parseRecalls(RECALLS_FIXTURE)).toEqual([
      {
        campaign: "17V384000",
        component: "AIR BAGS",
        summary: "The passenger frontal air bag inflator may rupture during deployment.",
        remedy: "Dealers will replace the passenger air bag inflator, free of charge.",
      },
      {
        campaign: "18V268000",
        component: "ELECTRICAL SYSTEM",
        summary: "The battery sensor may short circuit, increasing the risk of a fire.",
        remedy: "Dealers will inspect and replace the battery sensor as needed, free of charge.",
      },
    ]);
    expect(parseComplaints(COMPLAINTS_FIXTURE)).toEqual([
      { component: "ENGINE", count: 3 },
      { component: "ELECTRICAL SYSTEM", count: 2 },
      { component: "AIR BAGS", count: 1 },
      { component: "FUEL/PROPULSION SYSTEM", count: 1 },
      { component: "STEERING", count: 1 },
    ]);
  });

  it("fetches both endpoints for the vehicle", async () => {
    const f = vi
      .fn()
      .mockImplementation(async (url: string) => json(url.includes("recalls") ? RECALLS_FIXTURE : COMPLAINTS_FIXTURE));
    const r = await getRecalls({ year: 2017, make: "Honda", model: "Civic" }, f);
    expect(r.recalls).toHaveLength(2);
    expect(r.complaints[0]).toEqual({ component: "ENGINE", count: 3 });
    expect(r.calls).toBe(2);
    expect(String(f.mock.calls[0][0])).toContain("make=Honda&model=Civic&modelYear=2017");
  });

  it("returns empty lists, not a crash, on an API error", async () => {
    const r = await getRecalls({ year: 2017, make: "Honda", model: "Civic" }, vi.fn().mockRejectedValue(new Error("down")));
    expect(r).toEqual({ recalls: [], complaints: [], calls: 2 });
  });

  it("uses fixtures in offline mode without fetching", async () => {
    vi.stubEnv("DEALCHECK_OFFLINE", "1");
    const f = vi.fn();
    const r = await getRecalls({ year: 2017, make: "Honda", model: "Civic" }, f);
    expect(f).not.toHaveBeenCalled();
    expect(r.recalls.length).toBeGreaterThan(0);
    expect(await decodeVin("2HGFC2F79HH512345", f)).toMatchObject({ make: "Honda", model: "Civic" });
  });
});
