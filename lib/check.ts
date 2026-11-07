// The free check: VIN → comps → recalls → pricing → scam rules, saved under an
// unguessable id. Everything here is data and code; no model call.

import { FREE_CHECKS_PER_DAY } from "./config";
import { getComps } from "./comps";
import type { FetchLike } from "./http";
import { isOffline } from "./http";
import { newId } from "./ids";
import { allowDaily } from "./rateLimit";
import { computePricing, selectComps } from "./pricing";
import { getRecalls } from "./recalls";
import { runScamChecks } from "./scam";
import { getStore, type Store } from "./store";
import type { CheckRecord } from "./types";
import type { CheckInput } from "./validation";
import { decodeVin } from "./vin";

export type CheckDeps = { store?: Store; fetchImpl?: FetchLike; now?: Date };

export async function runCheck(input: CheckInput, deps: CheckDeps = {}): Promise<CheckRecord> {
  const store = deps.store ?? getStore();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const dataCalls = { marketcheck: 0, nhtsa: 0 };

  const vin = input.vin ? await decodeVin(input.vin, fetchImpl) : null;
  if (input.vin && !isOffline()) dataCalls.nhtsa++;

  const comps = await getComps(
    { year: input.year, make: input.make, model: input.model, zip: input.zip, mileage: input.mileage, vin: input.vin },
    { fetchImpl, store },
  );
  dataCalls.marketcheck += comps.calls;

  const selected = selectComps({ year: input.year, mileage: input.mileage }, comps.pool);
  const pricing = computePricing({
    asking: input.asking,
    comps: selected.comps,
    predictedPrice: comps.predictedPrice ?? undefined,
  });

  // Recalls follow the VIN when it decodes (it's the real car), else the listing.
  const car = vin ?? { year: input.year, make: input.make, model: input.model };
  const nhtsa = await getRecalls(car, fetchImpl);
  dataCalls.nhtsa += nhtsa.calls;

  const scam = runScamChecks({
    asking: input.asking,
    fairLow: pricing.fairLow,
    text: input.listingText ?? "",
    listing: { year: input.year, make: input.make, model: input.model },
    vin,
  });

  const record: CheckRecord = {
    id: newId(),
    createdAt: (deps.now ?? new Date()).toISOString(),
    input,
    vin,
    comps: [...selected.comps].sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0)),
    compsSearch: { radiusMiles: selected.radiusMiles, yearWindow: selected.yearWindow, source: comps.source },
    predictedPrice: comps.predictedPrice,
    pricing,
    recalls: nhtsa.recalls,
    complaints: nhtsa.complaints,
    scam,
    dataCalls,
  };
  await store.saveCheck(record);
  return record;
}

/** Counts a free check for this IP today. False once over the daily limit. */
export function allowFreeCheck(ip: string, store: Store = getStore(), now = new Date()): Promise<boolean> {
  return allowDaily(`check:${ip}`, FREE_CHECKS_PER_DAY, store, now);
}
