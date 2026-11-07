// Mock comps for running without a MarketCheck key. Deterministic for a given
// car (seeded by year/make/model/ZIP/mileage) so pages don't change on reload.
// Prices are illustrative, not real market data.

import type { Comp } from "../pricing";

export const MARKETCHECK_SEARCH_FIXTURE = {
  num_found: 6,
  listings: [
    { price: 12995, miles: 78200, dist: 12.4, build: { year: 2017, make: "Honda", model: "Civic" } },
    { price: 13450, miles: 71050, dist: 33.1, build: { year: 2017, make: "Honda", model: "Civic" } },
    { price: 11900, miles: 92300, dist: 48.7, build: { year: 2016, make: "Honda", model: "Civic" } },
    { price: 14200, miles: 66400, dist: 61.0, build: { year: 2018, make: "Honda", model: "Civic" } },
    { price: 12500, miles: 88900, dist: 87.5, build: { year: 2017, make: "Honda", model: "Civic" } },
    { miles: 80000, dist: 20, build: { year: 2017 } }, // no price: skipped
  ],
};

const NEW_PRICE: Record<string, number> = {
  honda: 25000,
  toyota: 27000,
  ford: 31000,
  chevrolet: 29000,
  nissan: 25000,
  hyundai: 23000,
  kia: 23000,
  subaru: 28000,
  mazda: 26000,
  jeep: 33000,
  ram: 38000,
  gmc: 38000,
  volkswagen: 27000,
  bmw: 46000,
  "mercedes-benz": 48000,
  lexus: 44000,
  audi: 44000,
  tesla: 48000,
};

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function valueFor(make: string, year: number, mileage: number, now = new Date()): number {
  const base = NEW_PRICE[make.toLowerCase()] ?? 27000;
  const age = Math.max(0, now.getFullYear() - year);
  const typicalMiles = Math.max(1, age) * 12000;
  const depreciated = base * Math.pow(0.92, age);
  const mileageAdj = 1 - Math.max(-0.15, Math.min(0.3, (mileage - typicalMiles) / 200000));
  return Math.max(1500, depreciated * mileageAdj);
}

export function mockComps(q: { year: number; make: string; model: string; zip: string; mileage: number }): Comp[] {
  const rand = seededRandom(`${q.year}|${q.make}|${q.model}|${q.zip}|${Math.round(q.mileage / 5000)}`.toLowerCase());
  const comps: Comp[] = [];
  for (let i = 0; i < 24; i++) {
    const year = q.year + [0, 0, 0, -1, 1, -2, 2][Math.floor(rand() * 7)];
    const mileage = Math.max(1000, Math.round(q.mileage + (rand() - 0.5) * 50000));
    const distanceMiles = Math.round((rand() < 0.75 ? rand() * 100 : 100 + rand() * 100) * 10) / 10;
    const noise = 1 + (rand() - 0.5) * 0.22;
    const price = Math.round((valueFor(q.make, year, mileage) * noise) / 100) * 100 - 5;
    comps.push({ price, year, mileage, distanceMiles });
  }
  return comps;
}

export function mockPredictedPrice(q: { year: number; make: string; mileage: number; vin?: string }): number | null {
  return q.vin ? Math.round(valueFor(q.make, q.year, q.mileage) / 100) * 100 : null;
}
