import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as checkRoute } from "../app/api/check/route";
import { allowFreeCheck } from "../lib/check";
import { fulfillOrder } from "../lib/fulfill";
import { MemoryStore } from "../lib/store";
import { ID_B, fakeAnthropic, freshStore, makeCheck, makeOrder } from "./helpers";

const body = { year: "2017", make: "Honda", model: "Civic", mileage: "84000", asking: "12500", zip: "48104" };
const checkReq = (ip: string) =>
  new Request("http://localhost/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("MARKETCHECK_API_KEY", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("DEALCHECK_OFFLINE", "1"); // no NHTSA calls
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("free check limit", () => {
  it("blocks the 4th free check from the same IP in a day (429)", async () => {
    freshStore();
    for (let i = 0; i < 3; i++) expect((await checkRoute(checkReq("203.0.113.7"))).status).toBe(200);
    const blocked = await checkRoute(checkReq("203.0.113.7"));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/3 free checks/);
    // Other IPs are unaffected.
    expect((await checkRoute(checkReq("198.51.100.2"))).status).toBe(200);
  });

  it("allows checks again the next day", async () => {
    const store = new MemoryStore();
    const day1 = new Date("2026-11-05T23:00:00Z");
    for (let i = 0; i < 3; i++) expect(await allowFreeCheck("1.2.3.4", store, day1)).toBe(true);
    expect(await allowFreeCheck("1.2.3.4", store, day1)).toBe(false);
    expect(await allowFreeCheck("1.2.3.4", store, new Date("2026-11-06T00:30:00Z"))).toBe(true);
  });

  it("doesn't count invalid requests against the limit", async () => {
    freshStore();
    const bad = () =>
      new Request("http://localhost/api/check", {
        method: "POST",
        headers: { "x-forwarded-for": "192.0.2.9" },
        body: JSON.stringify({ ...body, zip: "abc" }),
      });
    for (let i = 0; i < 5; i++) expect((await checkRoute(bad())).status).toBe(400);
    expect((await checkRoute(checkReq("192.0.2.9"))).status).toBe(200);
  });
});

describe("cost logging", () => {
  it("logs data calls and tokens on the order", async () => {
    const store = freshStore();
    await store.saveCheck(makeCheck());
    await store.createOrder(makeOrder({ status: "paid", paidAt: new Date().toISOString() }));
    const { client } = fakeAnthropic({ stop_reason: "refusal", content: [], usage: { input_tokens: 4200, output_tokens: 900 } as never });

    await fulfillOrder(ID_B, { store, client });

    const order = (await store.getOrder(ID_B))!;
    expect(order.cost).toEqual({
      dataCalls: { marketcheck: 1, nhtsa: 2 },
      inputTokens: 4200,
      outputTokens: 900,
      estimatedUsd: 0.0174,
    });
  });

  it("logs zero tokens for a template-only report", async () => {
    const store = freshStore();
    await store.saveCheck(makeCheck());
    await store.createOrder(makeOrder({ status: "paid", paidAt: new Date().toISOString() }));
    await fulfillOrder(ID_B, { store });
    expect((await store.getOrder(ID_B))!.cost).toMatchObject({ inputTokens: 0, outputTokens: 0, estimatedUsd: 0 });
  });
});
