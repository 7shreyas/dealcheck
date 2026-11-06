// Shared input validation for the free check. Used by the landing-page form
// (client side) and, later, by /api/check (server side, the one that counts).

export const LISTING_TEXT_MAX = 5000;
export const MILEAGE_MAX = 500_000;
export const YEAR_MIN = 1980;

export type CheckInputRaw = {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: string;
  asking?: string;
  zip?: string;
  vin?: string;
  listingText?: string;
};

export type CheckInput = {
  year: number;
  make: string;
  model: string;
  trim?: string;
  mileage: number;
  asking: number;
  zip: string;
  vin?: string;
  listingText?: string;
};

export type FieldErrors = Partial<Record<keyof CheckInputRaw, string>>;

/** Parses "12,500" or "$12,500" into 12500. Returns NaN for anything else. */
export function parseWholeNumber(value: string | undefined): number {
  if (value == null) return NaN;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d+$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

export function maxModelYear(now: Date = new Date()): number {
  // Next year's models go on sale during the current year.
  return now.getFullYear() + 1;
}

export function validateCheckInput(
  raw: CheckInputRaw,
  now: Date = new Date(),
): { ok: true; value: CheckInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const maxYear = maxModelYear(now);

  const year = parseWholeNumber(raw.year);
  if (Number.isNaN(year)) errors.year = "Enter the model year, like 2017.";
  else if (year < YEAR_MIN || year > maxYear)
    errors.year = `Year must be between ${YEAR_MIN} and ${maxYear}.`;

  const make = (raw.make ?? "").trim();
  if (!make) errors.make = "Enter the make, like Honda.";
  else if (make.length > 40) errors.make = "Make looks too long.";

  const model = (raw.model ?? "").trim();
  if (!model) errors.model = "Enter the model, like Civic.";
  else if (model.length > 60) errors.model = "Model looks too long.";

  const trim = (raw.trim ?? "").trim();
  if (trim.length > 60) errors.trim = "Trim looks too long.";

  const mileage = parseWholeNumber(raw.mileage);
  if (Number.isNaN(mileage)) errors.mileage = "Enter the mileage, like 84000.";
  else if (mileage < 0) errors.mileage = "Mileage can't be negative.";
  else if (mileage > MILEAGE_MAX) errors.mileage = "Mileage must be 500,000 or less.";

  const asking = parseWholeNumber(raw.asking);
  if (Number.isNaN(asking)) errors.asking = "Enter the asking price, like 9500.";
  else if (asking <= 0) errors.asking = "Asking price must be more than $0.";
  else if (asking > 1_000_000) errors.asking = "Asking price looks too high.";

  const zip = (raw.zip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) errors.zip = "Enter a 5-digit ZIP code.";

  const vin = (raw.vin ?? "").trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))
    errors.vin = "A VIN is 17 letters and numbers (no I, O or Q).";

  const listingText = (raw.listingText ?? "").trim().slice(0, LISTING_TEXT_MAX);

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      year,
      make,
      model,
      trim: trim || undefined,
      mileage,
      asking,
      zip,
      vin: vin || undefined,
      listingText: listingText || undefined,
    },
  };
}
