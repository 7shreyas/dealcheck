// Fetches one listing page the buyer pasted and turns it into plain text.
// Only allowlisted hosts are fetched (no open proxy / SSRF), every redirect hop
// is re-checked, and the response is time- and size-capped.

import { detectSource, isFetchableSource } from "./source";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
export const MAX_SOURCE_TEXT = 8000;

export class ListingFetchError extends Error {}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

export async function fetchListingHtml(url: URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "https:" || !isFetchableSource(detectSource(current))) {
      throw new ListingFetchError(`Refusing to fetch ${current.hostname}`);
    }
    const res = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "DealCheck/1.0 (listing reader)", Accept: "text/html" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new ListingFetchError("Redirect without a location");
      current = new URL(next, current);
      continue;
    }
    if (!res.ok) throw new ListingFetchError(`Listing returned ${res.status}`);
    return readCapped(res);
  }
  throw new ListingFetchError("Too many redirects");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d|span)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2] ?? "").trim() || null : null;
}

/** Pulls the useful parts of a listing page into plain text for extraction. */
export function listingTextFromHtml(html: string): string {
  const parts: string[] = [];
  const title = meta(html, "og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) parts.push(`Title: ${decode(title).trim()}`);
  const desc = meta(html, "og:description") ?? meta(html, "description");
  if (desc) parts.push(`Summary: ${desc}`);

  // Craigslist: attributes (odometer, VIN, etc.) and the posting body.
  for (const m of html.matchAll(/<div[^>]+class=["'][^"']*attrgroup[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    parts.push(stripTags(m[1]));
  }
  const body = html.match(/<section[^>]+id=["']postingbody["'][^>]*>([\s\S]*?)<\/section>/i);
  if (body) parts.push(stripTags(body[1]).replace(/QR Code Link to This Post/i, "").trim());

  // OfferUp and others: structured data, when present.
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    parts.push(m[1].trim());
  }

  const text = parts.filter(Boolean).join("\n").trim();
  return (text || stripTags(html)).slice(0, MAX_SOURCE_TEXT);
}
