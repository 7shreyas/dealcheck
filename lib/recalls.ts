// NHTSA recalls and complaints (free, no key). An API error returns an empty
// list, never a crash.

import { fetchJson, isOffline, type FetchLike } from "./http";
import { mockComplaints, mockRecalls } from "./mocks/nhtsa";
import type { ComplaintSummary, Recall } from "./types";

type RecallsResponse = {
  results?: { NHTSACampaignNumber?: string; Component?: string; Summary?: string; Remedy?: string }[];
};
type ComplaintsResponse = { results?: { components?: string }[] };

const MAX_RECALLS = 8;
const TOP_COMPLAINTS = 5;

const q = (v: { year: number; make: string; model: string }) =>
  `make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${v.year}`;

export function parseRecalls(json: RecallsResponse): Recall[] {
  return (json.results ?? [])
    .filter((r) => r.NHTSACampaignNumber && r.Component)
    .slice(0, MAX_RECALLS)
    .map((r) => ({
      campaign: r.NHTSACampaignNumber!,
      component: r.Component!,
      summary: (r.Summary ?? "").trim(),
      remedy: (r.Remedy ?? "").trim(),
    }));
}

/** Counts complaints per component (a complaint can list several). */
export function parseComplaints(json: ComplaintsResponse): ComplaintSummary[] {
  const counts = new Map<string, number>();
  for (const r of json.results ?? []) {
    for (const c of (r.components ?? "").split(",")) {
      const name = c.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([component, count]) => ({ component, count }))
    .sort((a, b) => b.count - a.count || a.component.localeCompare(b.component))
    .slice(0, TOP_COMPLAINTS);
}

export async function getRecalls(
  v: { year: number; make: string; model: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ recalls: Recall[]; complaints: ComplaintSummary[]; calls: number }> {
  if (isOffline()) return { recalls: mockRecalls(v), complaints: mockComplaints(v), calls: 0 };

  const [recalls, complaints] = await Promise.all([
    fetchJson<RecallsResponse>(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q(v)}`, fetchImpl)
      .then(parseRecalls)
      .catch((err) => {
        console.error("[recalls] fetch failed", err);
        return [] as Recall[];
      }),
    fetchJson<ComplaintsResponse>(`https://api.nhtsa.gov/complaints/complaintsByVehicle?${q(v)}`, fetchImpl)
      .then(parseComplaints)
      .catch((err) => {
        console.error("[complaints] fetch failed", err);
        return [] as ComplaintSummary[];
      }),
  ]);
  return { recalls, complaints, calls: 2 };
}
