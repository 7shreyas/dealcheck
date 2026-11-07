// Reply coach (7 days after purchase). The buyer pastes the seller's latest
// message; the coach writes the buyer's next text.
//
// Rules: never suggest paying above the walk-away price (checked in code, not
// just the prompt); if a scam rule triggers on the seller's message, tell the
// buyer to stop and why, with no model call; seller text is wrapped with
// wrapUntrusted and the system prompt carries UNTRUSTED_NOTE.

import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL, COACH_DAYS, COACH_EFFORT, COACH_MAX_TOKENS, hasAnthropicKey } from "./config";
import { carName, usd } from "./format";
import { buildFacts, explainFlag, textOf } from "./report";
import { runScamChecks, type ScamRuleId } from "./scam";
import type { CheckRecord, CoachMessage, OrderRecord } from "./types";
import { UNTRUSTED_NOTE, wrapUntrusted } from "./untrusted";

export const COACH_MESSAGE_MAX = 2000;
const HISTORY_TURNS = 8;

export class CoachExpiredError extends Error {}

export type CoachReply = { reply: string; tip: string; stop: boolean; writer: "model" | "template" | "rules" };

export function coachExpiresAt(order: OrderRecord): Date | null {
  return order.paidAt ? new Date(new Date(order.paidAt).getTime() + COACH_DAYS * 24 * 60 * 60 * 1000) : null;
}

export function coachIsOpen(order: OrderRecord, now = new Date()): boolean {
  const ends = coachExpiresAt(order);
  return order.status === "paid" && ends !== null && now < ends;
}

/** The most the coach will ever suggest: walk-away when we have one, else the asking price. */
export function priceCeiling(check: CheckRecord): number {
  const facts = buildFacts(check);
  return facts.showOffers && check.pricing.walkAway !== null ? check.pricing.walkAway : check.input.asking;
}

/** Scam rules that can fire on a seller message (price/VIN rules need listing data). */
export function scamStop(check: CheckRecord, sellerMessage: string): CoachReply | null {
  const { rules } = runScamChecks({
    asking: check.input.asking,
    fairLow: null,
    text: sellerMessage,
    listing: { year: check.input.year, make: check.input.make, model: check.input.model },
    vin: null,
  });
  const hits = rules.filter((r) => r.triggered).map((r) => r.id as ScamRuleId);
  if (hits.length === 0) return null;
  const reasons = hits.map((id) => {
    const { label, advice } = explainFlag(id);
    return `${label}: ${advice}`;
  });
  return {
    reply: "",
    tip: `Stop here. Don't send money or personal details. This message has warning signs of a scam.\n\n${reasons.join("\n\n")}`,
    stop: true,
    writer: "rules",
  };
}

const DOLLAR_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?(k)?\b/gi;

/** Dollar figures in a suggested reply that are above the ceiling. */
export function figuresAboveCeiling(text: string, ceiling: number): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DOLLAR_RE)) {
    const value = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (value > ceiling) out.push(m[0]);
  }
  return out;
}

export function templateReply(check: CheckRecord): CoachReply {
  const facts = buildFacts(check);
  const ceiling = priceCeiling(check);
  return {
    reply: facts.showOffers
      ? `Thanks for getting back to me. The most I can do is ${usd(ceiling)}. If that works, I can come see it this week.`
      : "Thanks for getting back to me. I'd like to see the car and have it inspected before we talk numbers. When works for you?",
    tip: `Stay at or below ${usd(ceiling)}. If the seller won't move, it's fine to walk away.`,
    stop: false,
    writer: "template",
  };
}

export const COACH_SYSTEM = [
  "You help someone buying a used car from a private seller write their next text message to the seller.",
  "The reply is short, friendly and firm, like a real person texting: one to three sentences, no greetings like 'Dear', no sign-off.",
  "Never suggest paying more than the ceiling in DEAL. Don't repeat any price above the ceiling, even the seller's. Use only prices given in DEAL or written by the seller.",
  "If the seller agrees to a price at or below the ceiling, help the buyer set up a viewing and inspection before any payment.",
  "Never suggest sending a deposit, gift cards, wire transfers or paying before seeing the car and title.",
  "tip: one short sentence of advice for the buyer (not sent to the seller).",
  "Return only the requested fields. Don't include your reasoning.",
  UNTRUSTED_NOTE,
].join("\n");

const REPLY_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, tip: { type: "string" } },
  required: ["reply", "tip"],
  additionalProperties: false,
};

export function buildCoachPrompt(check: CheckRecord, history: CoachMessage[], sellerMessage: string): string {
  const facts = buildFacts(check);
  const p = check.pricing;
  const deal = {
    car: carName(check.input),
    asking: usd(check.input.asking),
    fair_range: p.fairLow !== null ? `${usd(p.fairLow)} to ${usd(p.fairHigh!)}` : null,
    target_offer: facts.showOffers ? usd(p.target!) : null,
    walk_away: facts.showOffers ? usd(p.walkAway!) : null,
    ceiling: usd(priceCeiling(check)),
  };
  const recent = history.slice(-HISTORY_TURNS).map((m) =>
    m.role === "seller" ? `Seller said:\n${wrapUntrusted(m.text)}` : `Buyer replied: ${m.text || "(stopped: scam warning)"}`,
  );
  return [
    `DEAL:\n${JSON.stringify(deal, null, 2)}`,
    recent.length ? `Conversation so far:\n${recent.join("\n\n")}` : "",
    `The seller's newest message:\n${wrapUntrusted(sellerMessage)}`,
    "Write the buyer's next text to the seller.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function coachReply(args: {
  order: OrderRecord;
  check: CheckRecord;
  history: CoachMessage[];
  sellerMessage: string;
  client?: Anthropic;
  now?: Date;
}): Promise<CoachReply> {
  const { order, check, history, sellerMessage } = args;
  if (!coachIsOpen(order, args.now)) throw new CoachExpiredError("The reply coach is closed for this order.");

  const stop = scamStop(check, sellerMessage);
  if (stop) return stop;

  if (!args.client && !hasAnthropicKey()) return templateReply(check);
  const client = args.client ?? new Anthropic();
  const ceiling = priceCeiling(check);
  const content = buildCoachPrompt(check, history, sellerMessage);

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: COACH_MAX_TOKENS,
        system: COACH_SYSTEM,
        output_config: { effort: COACH_EFFORT, format: { type: "json_schema", schema: REPLY_SCHEMA } },
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      console.error("[coach] model call failed", err);
      return templateReply(check);
    }
    if (response.stop_reason === "refusal") return templateReply(check);
    let parsed: { reply?: unknown; tip?: unknown };
    try {
      parsed = JSON.parse(textOf(response));
    } catch {
      continue;
    }
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) continue;
    const tip = typeof parsed.tip === "string" ? parsed.tip : "";
    const over = figuresAboveCeiling(`${parsed.reply}\n${tip}`, ceiling);
    if (over.length === 0) return { reply: parsed.reply.trim(), tip: tip.trim(), stop: false, writer: "model" };
    console.warn("[coach] reply went above the ceiling:", over.join(", "));
  }
  return templateReply(check);
}
