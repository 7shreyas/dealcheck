// Simple fixed-window limiter keyed by IP and UTC day.
// In-memory: fine for local dev and a single instance. On Vercel each instance
// keeps its own counts, so move this to Supabase when the free-check limiter
// (3/day) is built.

export type Limiter = { hit: (key: string, now?: Date) => boolean };

export function createDailyLimiter(limit: number): Limiter {
  const counts = new Map<string, number>();
  let day = "";
  return {
    hit(key, now = new Date()) {
      const today = now.toISOString().slice(0, 10);
      if (today !== day) {
        counts.clear();
        day = today;
      }
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= limit;
    },
  };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
