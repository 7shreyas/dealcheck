// POST /api/listing — read car details from a listing link or screenshots.
//   JSON { url }                 → fetch (Craigslist/OfferUp only) and extract
//   multipart "images" (1–4)     → extract from screenshots
// Returns prefill fields for the buyer to confirm. Never runs the check itself.

import { NextResponse } from "next/server";
import { EXTRACT_LIMIT_PER_DAY } from "@/lib/config";
import { extractFromImages, extractFromText, type ExtractResult, type ListingImage } from "@/lib/listing/extract";
import { fetchListingHtml, listingTextFromHtml } from "@/lib/listing/fetch";
import { detectSource, isFetchableSource, parseListingUrl } from "@/lib/listing/source";
import { clientIp, createDailyLimiter } from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 4_000_000; // stays under Vercel's 4.5 MB request cap
const IMAGE_TYPES = new Set<ListingImage["mediaType"]>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const limiter = createDailyLimiter(EXTRACT_LIMIT_PER_DAY);

type ListingErrorReason =
  | "invalid_url"
  | "facebook"
  | "unsupported_site"
  | "fetch_failed"
  | "bad_images"
  | "rate_limited";

function fail(reason: ListingErrorReason, message: string, status: number) {
  return NextResponse.json({ ok: false, reason, message }, { status });
}

function succeed(result: ExtractResult, source: string) {
  return NextResponse.json({ ok: true, source, ...result });
}

export async function POST(req: Request) {
  if (!limiter.hit(clientIp(req.headers))) {
    return fail("rate_limited", "You've read a lot of listings today. Enter the details by hand, or try again tomorrow.", 429);
  }

  const type = req.headers.get("content-type") ?? "";
  if (type.startsWith("multipart/form-data")) return fromImages(req);
  return fromUrl(req);
}

async function fromUrl(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_url", "Paste the link to the listing.", 400);
  }
  const raw = typeof body === "object" && body && "url" in body ? String((body as { url: unknown }).url) : "";
  const url = parseListingUrl(raw.slice(0, 2000));
  if (!url) return fail("invalid_url", "That doesn't look like a listing link.", 400);

  const source = detectSource(url);
  if (source === "facebook") {
    return fail(
      "facebook",
      "Facebook doesn't let us open Marketplace listings. Upload screenshots of the listing or enter the details.",
      422,
    );
  }
  if (!isFetchableSource(source)) {
    return fail("unsupported_site", "We can read Craigslist and OfferUp links. For other sites, upload screenshots or enter the details.", 422);
  }

  let text: string;
  try {
    url.protocol = "https:";
    text = listingTextFromHtml(await fetchListingHtml(url));
  } catch (err) {
    console.error("[listing] fetch failed", err);
    return fail("fetch_failed", "We couldn't open that listing. It may have been removed. Upload screenshots or enter the details.", 502);
  }
  if (!text.trim()) {
    return fail("fetch_failed", "That page didn't have listing details we could read. Upload screenshots or enter the details.", 502);
  }

  return succeed(await extractFromText(text), source);
}

async function fromImages(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("bad_images", "We couldn't read those images. Try again.", 400);
  }
  const files = form.getAll("images").filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail("bad_images", "Add at least one screenshot.", 400);
  if (files.length > MAX_IMAGES) return fail("bad_images", `Add up to ${MAX_IMAGES} screenshots.`, 400);

  let total = 0;
  const images: ListingImage[] = [];
  for (const file of files) {
    const mediaType = file.type as ListingImage["mediaType"];
    if (!IMAGE_TYPES.has(mediaType)) return fail("bad_images", "Screenshots must be JPG, PNG, GIF or WebP images.", 400);
    if (file.size > MAX_IMAGE_BYTES) return fail("bad_images", "One of the screenshots is too large.", 400);
    total += file.size;
    if (total > MAX_TOTAL_BYTES) return fail("bad_images", "Those screenshots are too large together. Try fewer.", 400);
    images.push({ mediaType, base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  return succeed(await extractFromImages(images), "screenshots");
}
