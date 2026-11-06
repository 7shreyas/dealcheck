// Which marketplace a listing link points to. Pure and client-safe, so the form
// can warn about Facebook links before anything is sent.

export type ListingSource = "facebook" | "craigslist" | "offerup";

const FACEBOOK_HOSTS = ["facebook.com", "fb.com", "fb.me", "fb.watch"];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Parses a pasted link, adding https:// if the buyer left it off. */
export function parseListingUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** null means a site we don't read (we ask for screenshots or details instead). */
export function detectSource(url: URL): ListingSource | null {
  const host = url.hostname.toLowerCase();
  if (FACEBOOK_HOSTS.some((d) => hostMatches(host, d))) return "facebook";
  if (hostMatches(host, "craigslist.org")) return "craigslist";
  if (hostMatches(host, "offerup.com")) return "offerup";
  return null;
}

/** Sites whose pages we fetch server-side. Facebook needs a login, so it's excluded. */
export function isFetchableSource(source: ListingSource | null): source is "craigslist" | "offerup" {
  return source === "craigslist" || source === "offerup";
}
