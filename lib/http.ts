// Small JSON fetch helper with a timeout. Data modules take a fetch function
// so tests can inject a mock (no test hits the network).

export type FetchLike = typeof fetch;

export async function fetchJson<T>(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 8000): Promise<T> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return (await res.json()) as T;
}

/**
 * DEALCHECK_OFFLINE=1 puts every service in mock mode, even when keys are set,
 * and skips free public APIs (NHTSA) too: no network calls at all. Used by the
 * Playwright smoke test.
 */
export function isOffline(): boolean {
  return process.env.DEALCHECK_OFFLINE === "1";
}
