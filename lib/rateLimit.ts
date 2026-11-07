// Per-day limits, counted in the store (Supabase in production, memory in
// mock mode), so every server instance shares the same counts.

import { getStore, type Store } from "./store";

/** Counts one use of `key` today. False once the count is over `limit`. */
export async function allowDaily(key: string, limit: number, store: Store = getStore(), now = new Date()): Promise<boolean> {
  return (await store.incrementDaily(key, now.toISOString().slice(0, 10))) <= limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
