// NHTSA fixtures for offline mode and tests. Shapes match the live API.

import type { ComplaintSummary, Recall, VinInfo } from "../types";

export const VPIC_FIXTURE = {
  Count: 1,
  Results: [{ ModelYear: "2017", Make: "HONDA", Model: "Civic", Trim: "EX", ErrorCode: "0" }],
};

export const VPIC_INVALID_FIXTURE = {
  Count: 1,
  Results: [{ ModelYear: "", Make: "", Model: "", Trim: "", ErrorCode: "1,11,400" }],
};

export const RECALLS_FIXTURE = {
  Count: 2,
  results: [
    {
      NHTSACampaignNumber: "17V384000",
      Component: "AIR BAGS",
      Summary: "The passenger frontal air bag inflator may rupture during deployment.",
      Remedy: "Dealers will replace the passenger air bag inflator, free of charge.",
    },
    {
      NHTSACampaignNumber: "18V268000",
      Component: "ELECTRICAL SYSTEM",
      Summary: "The battery sensor may short circuit, increasing the risk of a fire.",
      Remedy: "Dealers will inspect and replace the battery sensor as needed, free of charge.",
    },
  ],
};

export const COMPLAINTS_FIXTURE = {
  count: 6,
  results: [
    { components: "AIR BAGS" },
    { components: "ELECTRICAL SYSTEM,ENGINE" },
    { components: "ENGINE" },
    { components: "ENGINE,FUEL/PROPULSION SYSTEM" },
    { components: "STEERING" },
    { components: "ELECTRICAL SYSTEM" },
  ],
};

/** Offline VIN decode: a known test VIN decodes; anything else returns a plausible car. */
export function mockVin(vin: string): VinInfo | null {
  if (vin === "2HGFC2F79HH512345") return { year: 2017, make: "Honda", model: "Civic", trim: "EX" };
  return null;
}

export function mockRecalls(v: { year: number; make: string; model: string }): Recall[] {
  void v;
  return RECALLS_FIXTURE.results.map((r) => ({
    campaign: r.NHTSACampaignNumber,
    component: r.Component,
    summary: r.Summary,
    remedy: r.Remedy,
  }));
}

export function mockComplaints(v: { year: number; make: string; model: string }): ComplaintSummary[] {
  void v;
  return [
    { component: "ENGINE", count: 3 },
    { component: "ELECTRICAL SYSTEM", count: 2 },
    { component: "AIR BAGS", count: 1 },
  ];
}
