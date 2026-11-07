// Shared fixtures for tests. Nothing here touches the network.

import { vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { computePricing, type Comp } from "../lib/pricing";
import { runScamChecks } from "../lib/scam";
import { MemoryStore, setStore } from "../lib/store";
import type { CheckRecord, OrderRecord } from "../lib/types";
import type { CheckInput } from "../lib/validation";

export const ID_A = "AAAAAAAAAAAAAAAAAAAAAA";
export const ID_B = "BBBBBBBBBBBBBBBBBBBBBB";
export const ID_C = "CCCCCCCCCCCCCCCCCCCCCC";

export const COMPS: Comp[] = [
  { price: 11000, year: 2017, mileage: 80000, distanceMiles: 10 },
  { price: 11800, year: 2017, mileage: 82000, distanceMiles: 20 },
  { price: 12300, year: 2016, mileage: 90000, distanceMiles: 30 },
  { price: 12800, year: 2018, mileage: 76000, distanceMiles: 40 },
  { price: 13500, year: 2017, mileage: 70000, distanceMiles: 50 },
];

export function makeCheck(overrides: { input?: Partial<CheckInput>; comps?: Comp[]; predictedPrice?: number } = {}): CheckRecord {
  const input: CheckInput = {
    year: 2017,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    mileage: 84000,
    asking: 13900,
    zip: "48104",
    listingText: "Clean title, one owner. Runs great.",
    ...overrides.input,
  };
  const comps = overrides.comps ?? COMPS;
  const pricing = computePricing({ asking: input.asking, comps, predictedPrice: overrides.predictedPrice });
  return {
    id: ID_A,
    createdAt: "2026-11-05T12:00:00.000Z",
    input,
    vin: null,
    comps,
    compsSearch: { radiusMiles: 100, yearWindow: 1, source: "mock" },
    predictedPrice: overrides.predictedPrice ?? null,
    pricing,
    recalls: [{ campaign: "17V384000", component: "AIR BAGS", summary: "Inflator may rupture.", remedy: "Free replacement." }],
    complaints: [{ component: "ENGINE", count: 3 }],
    scam: runScamChecks({
      asking: input.asking,
      fairLow: pricing.fairLow,
      text: input.listingText ?? "",
      listing: { year: input.year, make: input.make, model: input.model },
      vin: null,
    }),
    dataCalls: { marketcheck: 1, nhtsa: 2 },
  };
}

export function makeOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: ID_B,
    checkId: ID_A,
    status: "pending",
    createdAt: "2026-11-05T12:00:00.000Z",
    paidAt: null,
    email: null,
    stripeSessionId: null,
    report: null,
    cost: null,
    emailedAt: null,
    ...overrides,
  };
}

/** Fresh in-memory store, installed as the app's store. */
export function freshStore(): MemoryStore {
  const store = new MemoryStore();
  setStore(store);
  return store;
}

type FakeResponse = Partial<Anthropic.Message> & { json?: unknown };

/** Anthropic client stub. Each response may pass `json`, returned as a text block after a thinking block. */
export function fakeAnthropic(...responses: FakeResponse[]) {
  const create = vi.fn();
  for (const { json, ...r } of responses) {
    create.mockResolvedValueOnce({
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 500 },
      content:
        json === undefined
          ? []
          : [
              { type: "thinking", thinking: "", signature: "sig" },
              { type: "text", text: JSON.stringify(json), citations: null },
            ],
      ...r,
    });
  }
  return { client: { messages: { create } } as unknown as Anthropic, create };
}

/** Lets un-awaited background tasks (fulfillment) finish. */
export const flush = () => new Promise((r) => setTimeout(r, 20));
