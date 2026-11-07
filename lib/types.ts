// Shared record shapes for checks, orders, reports and the reply coach.

import type { Comp, Pricing } from "./pricing";
import type { ScamRisk, ScamRule } from "./scam";
import type { CheckInput } from "./validation";

export type VinInfo = { year: number; make: string; model: string; trim?: string };

export type Recall = { campaign: string; component: string; summary: string; remedy: string };
export type ComplaintSummary = { component: string; count: number };

export type DataSource = "live" | "mock";

export type CheckRecord = {
  id: string;
  createdAt: string;
  input: CheckInput;
  vin: VinInfo | null;
  comps: Comp[];
  compsSearch: { radiusMiles: number; yearWindow: number; source: DataSource };
  predictedPrice: number | null;
  pricing: Pricing;
  recalls: Recall[];
  complaints: ComplaintSummary[];
  scam: { rules: ScamRule[]; risk: ScamRisk };
  /** External calls made for this check (for cost logging). */
  dataCalls: { marketcheck: number; nhtsa: number };
};

export type ReportSection = { id: ReportSectionId; title: string; body: ReportBlock[] };

export type ReportSectionId =
  | "verdict"
  | "numbers"
  | "scam"
  | "red_flags"
  | "messages"
  | "checklist"
  | "next_step";

export type ReportBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "message"; label: string; text: string };

export type Report = {
  sections: ReportSection[];
  /** "model" when the model wrote the words; "template" when it fell back. */
  writer: "model" | "template";
  generatedAt: string;
};

export type CostLog = {
  dataCalls: { marketcheck: number; nhtsa: number };
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
};

export type OrderStatus = "pending" | "paid";

export type OrderRecord = {
  id: string;
  checkId: string;
  status: OrderStatus;
  createdAt: string;
  paidAt: string | null;
  email: string | null;
  stripeSessionId: string | null;
  report: Report | null;
  cost: CostLog | null;
  emailedAt: string | null;
};

export type CoachMessage = {
  orderId: string;
  role: "seller" | "coach";
  text: string;
  /** Coach told the buyer to stop (a scam rule fired). */
  stop: boolean;
  createdAt: string;
};
