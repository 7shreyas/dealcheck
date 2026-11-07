import { describe, expect, it } from "vitest";
import { LISTING_TEXT_MAX, validateCheckInput, type CheckInputRaw } from "../lib/validation";

const NOW = new Date("2026-11-05T12:00:00Z");
const good: CheckInputRaw = { year: "2017", make: "Honda", model: "Civic", mileage: "84,000", asking: "$12,500", zip: "48104" };
const errorsFor = (patch: CheckInputRaw) => {
  const r = validateCheckInput({ ...good, ...patch }, NOW);
  return r.ok ? {} : r.errors;
};

describe("validateCheckInput", () => {
  it("accepts good input and parses numbers with commas and $", () => {
    const r = validateCheckInput(good, NOW);
    expect(r).toEqual({
      ok: true,
      value: { year: 2017, make: "Honda", model: "Civic", trim: undefined, mileage: 84000, asking: 12500, zip: "48104", vin: undefined, listingText: undefined },
    });
  });

  it("rejects a missing or negative price", () => {
    expect(errorsFor({ asking: "" }).asking).toBeDefined();
    expect(errorsFor({ asking: "-500" }).asking).toBeDefined();
    expect(errorsFor({ asking: "0" }).asking).toBeDefined();
  });

  it("rejects mileage over 500,000 or negative", () => {
    expect(errorsFor({ mileage: "500,001" }).mileage).toBeDefined();
    expect(errorsFor({ mileage: "500000" }).mileage).toBeUndefined();
    expect(errorsFor({ mileage: "-1" }).mileage).toBeDefined();
  });

  it("rejects a year in the future or before 1980", () => {
    expect(errorsFor({ year: "2028" }).year).toBeDefined(); // next year's models (2027) are allowed
    expect(errorsFor({ year: "2027" }).year).toBeUndefined();
    expect(errorsFor({ year: "1979" }).year).toBeDefined();
    expect(errorsFor({ year: "abc" }).year).toBeDefined();
  });

  it("rejects an invalid ZIP", () => {
    for (const zip of ["", "4810", "481044", "4810A", "48104-1234"]) expect(errorsFor({ zip }).zip).toBeDefined();
  });

  it("rejects a malformed VIN but allows none", () => {
    expect(errorsFor({ vin: "123" }).vin).toBeDefined();
    expect(errorsFor({ vin: "2HGFC2F79HH51234I" }).vin).toBeDefined(); // I isn't used in VINs
    expect(errorsFor({ vin: "" }).vin).toBeUndefined();
    const r = validateCheckInput({ ...good, vin: " 2hgfc2f79hh512345 " }, NOW);
    expect(r.ok && r.value.vin).toBe("2HGFC2F79HH512345");
  });

  it("trims and caps listing text at 5,000 characters", () => {
    const r = validateCheckInput({ ...good, listingText: `   ${"a".repeat(6000)}   ` }, NOW);
    expect(r.ok && r.value.listingText).toHaveLength(LISTING_TEXT_MAX);
    expect(LISTING_TEXT_MAX).toBe(5000);
    const blank = validateCheckInput({ ...good, listingText: "   " }, NOW);
    expect(blank.ok && blank.value.listingText).toBeUndefined();
  });

  it("requires make and model and caps their length", () => {
    expect(errorsFor({ make: " " }).make).toBeDefined();
    expect(errorsFor({ model: "" }).model).toBeDefined();
    expect(errorsFor({ make: "x".repeat(41) }).make).toBeDefined();
    expect(errorsFor({ trim: "x".repeat(61) }).trim).toBeDefined();
  });
});
