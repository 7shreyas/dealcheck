// Deal Kit report. Code does the numbers, the model does the words.
//
// Every number in the report comes from the check (pricing, comps, recalls,
// scam rules). The model gets those as display-ready strings and writes only
// the prose. Afterwards every dollar figure in its output must appear in our
// data; one failed check regenerates, a second falls back to the template-only
// report. Refusals and API errors also fall back. Listing text is wrapped with
// wrapUntrusted and the system prompt carries UNTRUSTED_NOTE.

import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_MODEL,
  MODEL_USD_PER_MTOK,
  REPORT_EFFORT,
  REPORT_MAX_TOKENS,
  hasAnthropicKey,
  marketcheckUsdPerCall,
} from "./config";
import { carName, int, usd } from "./format";
import { findUnverifiedNumbers } from "./numberCheck";
import type { ScamRuleId } from "./scam";
import type { CheckRecord, CostLog, Report, ReportBlock, ReportSection } from "./types";
import { UNTRUSTED_NOTE, wrapUntrusted } from "./untrusted";

// ---------------------------------------------------------------------------
// Facts: everything numeric, decided by code.

export type ReportFacts = {
  car: string;
  verdictLine: string;
  /** Offer numbers are hidden when the data can't support them. */
  showOffers: boolean;
  lowConfidenceReason: string | null;
  allowedDollars: number[];
};

const SCAM_LABELS: Record<ScamRuleId, string> = {
  price_far_below_market: "Price far below similar cars",
  scam_keywords: "Words often used in scams",
  vin_mismatch: "VIN doesn't match the listing",
  title_problem: "Title problem",
  no_meeting_or_inspection: "Seller won't meet or allow an inspection",
  urgency: "Pressure to decide fast",
};

const SCAM_ADVICE: Record<ScamRuleId, string> = {
  price_far_below_market:
    "A price this far below market is the most common sign of a scam. Don't pay anything until you've seen the car and the title in person.",
  scam_keywords:
    "Never pay with gift cards, wire transfers, Zelle deposits or an \"escrow\" or \"eBay protection\" service the seller suggests. Real private sellers meet in person.",
  vin_mismatch:
    "The VIN belongs to a different car than the listing describes. Ask the seller to explain, and check the VIN on the dashboard, the door sticker and the title yourself.",
  title_problem: "Only buy if the seller's name is on the title and it matches their ID. No title, no deal.",
  no_meeting_or_inspection: "Don't buy a car you can't see, drive and have inspected. Walk away if the seller won't allow it.",
  urgency: "Pressure to decide fast is a common scam tactic. Take your time and never send a deposit to hold a car.",
};

export function explainFlag(id: ScamRuleId): { label: string; advice: string } {
  return { label: SCAM_LABELS[id], advice: SCAM_ADVICE[id] };
}

export function buildFacts(check: CheckRecord): ReportFacts {
  const { pricing, input, comps } = check;
  const car = carName(input);

  let verdictLine: string;
  switch (pricing.verdict) {
    case "overpriced":
      verdictLine = `Overpriced: about ${usd(pricing.overpricedBy!)} above the typical price`;
      break;
    case "suspiciously_cheap":
      verdictLine = "Suspiciously cheap: be very careful";
      break;
    case "fair":
      verdictLine = "Fair price";
      break;
    default:
      verdictLine = "Not enough data for a price verdict";
  }

  let lowConfidenceReason: string | null = null;
  if (pricing.verdict === "unknown") {
    lowConfidenceReason = "We couldn't find similar cars for sale near you, so we can't judge this price.";
  } else if (pricing.confidence === "low") {
    lowConfidenceReason =
      comps.length < 5
        ? `We only found ${comps.length} similar ${comps.length === 1 ? "car" : "cars"} for sale near you, so these numbers are rough.`
        : "Market price estimates for this car disagree with each other, so these numbers are rough.";
  }

  const showOffers = pricing.verdict !== "unknown" && pricing.confidence === "normal";

  const allowed = [input.asking, ...comps.slice(0, 5).map((c) => c.price)];
  for (const n of [pricing.fairLow, pricing.fairHigh, pricing.median, pricing.overpricedBy]) if (n !== null) allowed.push(n);
  if (showOffers) for (const n of [pricing.target, pricing.walkAway]) if (n !== null) allowed.push(n);

  return { car, verdictLine, showOffers, lowConfidenceReason, allowedDollars: allowed };
}

// ---------------------------------------------------------------------------
// Words: written by the model, or by these templates.

export type ReportWords = {
  verdict_why: string;
  scam_advice: string[];
  red_flags_summary: string;
  inspect: string[];
  inspection_advice: string;
  messages: {
    pre_meeting_questions: string;
    opening_offer: string;
    price_is_firm: string;
    counteroffer: string;
    walk_away: string;
  };
  next_step: string;
};

const COMPONENT_CHECKS: Record<string, string> = {
  ENGINE: "Listen for knocking or ticking on a cold start, and look for oil leaks under the car.",
  "POWER TRAIN": "Check that the transmission shifts smoothly, with no slipping or clunks.",
  TRANSMISSION: "Check that the transmission shifts smoothly, with no slipping or clunks.",
  "ELECTRICAL SYSTEM": "Test every light, window, lock and the infotainment screen. Watch for warning lights.",
  "AIR BAGS": "Make sure the airbag warning light turns off after starting, and that any airbag recall was done.",
  BRAKES: "Brake hard once at low speed: the car should stop straight, without grinding or pulsing.",
  STEERING: "Steering should feel tight, with no clunks over bumps and no pull to one side.",
  SUSPENSION: "Drive over bumps and listen for clunks. Look for uneven tire wear.",
  "FUEL/PROPULSION SYSTEM": "Watch for hesitation when you accelerate and check for a fuel smell.",
  "SERVICE BRAKES": "Brake hard once at low speed: the car should stop straight, without grinding or pulsing.",
};

export function templateWords(check: CheckRecord, facts: ReportFacts): ReportWords {
  const { pricing, scam, recalls, complaints, input } = check;
  const range = pricing.fairLow !== null ? `${usd(pricing.fairLow)} to ${usd(pricing.fairHigh!)}` : null;

  const verdictWhy = {
    overpriced: `The asking price of ${usd(input.asking)} is above what similar cars near you are listed for (${range}). The typical price is ${usd(pricing.median ?? 0)}.`,
    fair: `The asking price of ${usd(input.asking)} is within the range similar cars near you are listed for (${range}).`,
    suspiciously_cheap: `The asking price of ${usd(input.asking)} is far below similar cars near you (${range}). Prices this low are a common sign of a scam.`,
    unknown: "We couldn't find enough similar cars for sale near you to judge this price.",
  }[pricing.verdict];

  const triggered = scam.rules.filter((r) => r.triggered).map((r) => r.id as ScamRuleId);
  const scamAdvice = triggered.length
    ? triggered.map((id) => SCAM_ADVICE[id])
    : ["We didn't find common scam signs. Still meet in person, check the title and never pay before you see the car."];

  const inspect = new Set<string>();
  for (const c of complaints) {
    const tip = COMPONENT_CHECKS[c.component.toUpperCase()];
    if (tip) inspect.add(tip);
  }
  inspect.add("Look for rust under the car and around the wheel wells.");
  inspect.add("Check the tires for even wear and enough tread.");
  inspect.add("Ask for service records, and check the oil level and color.");

  const strongPpi = input.mileage >= 100000 || recalls.length > 0 || scam.risk !== "low";
  const recallText = recalls.length
    ? `This model year has ${recalls.length} recall${recalls.length === 1 ? "" : "s"} on record. Ask the seller if the recall work was done, or have a dealer check the VIN; recall repairs are free.`
    : "We didn't find recalls on record for this model year.";
  const complaintText = complaints.length
    ? ` Owners most often report problems with: ${complaints.map((c) => c.component.toLowerCase()).join(", ")}.`
    : "";

  const firm = facts.showOffers
    ? `I understand. Similar cars near me are listed for less, so the most I can do is ${usd(pricing.walkAway!)}. If that works for you, I can come see it this week.`
    : "I understand. I'd still like to see it. If the inspection goes well, would you consider a little off the asking price?";
  const counter = facts.showOffers
    ? `Thanks for working with me. I can go up to ${usd(pricing.walkAway!)}, but that's my limit.`
    : "Thanks for working with me. Let me think it over after I see the car and the inspection results.";

  let nextStep = "Send the pre-meeting questions, then set up a time to see the car with a mechanic.";
  if (scam.risk === "high") nextStep = "Don't send any money. Only continue if you can see the car and the title in person; otherwise walk away.";
  else if (pricing.verdict === "overpriced" && facts.showOffers) nextStep = "Send the pre-meeting questions, then make your opening offer.";

  return {
    verdict_why: verdictWhy,
    scam_advice: scamAdvice,
    red_flags_summary: recallText + complaintText,
    inspect: [...inspect].slice(0, 6),
    inspection_advice: strongPpi
      ? "A pre-purchase inspection by an independent mechanic is strongly recommended for this car."
      : "A pre-purchase inspection by an independent mechanic is a good idea before you pay.",
    messages: {
      pre_meeting_questions: `Hi! Is the ${facts.car} still available? A few quick questions: Is the title clean and in your name? Any accidents or warning lights? Do you have service records? And can I bring a mechanic to look it over?`,
      opening_offer: facts.showOffers
        ? `Thanks! I'm interested. Based on similar cars nearby, would you take ${usd(pricing.target!)}? I can meet this week.`
        : "Thanks! I'm interested. Is there any flexibility on the price? I can meet this week.",
      price_is_firm: firm,
      counteroffer: counter,
      walk_away: "Thanks for your time. That's more than I can spend, so I'll pass for now. If anything changes, feel free to reach out.",
    },
    next_step: nextStep,
  };
}

// ---------------------------------------------------------------------------
// Assembly: 7 sections, always in this order.

export const SECTION_ORDER: { id: ReportSection["id"]; title: string }[] = [
  { id: "verdict", title: "Verdict" },
  { id: "numbers", title: "Your numbers" },
  { id: "scam", title: "Scam check" },
  { id: "red_flags", title: "Red flags for this model" },
  { id: "messages", title: "Messages to send the seller" },
  { id: "checklist", title: "Meetup and payment checklist" },
  { id: "next_step", title: "Next step" },
];

export const MEETUP_CHECKLIST = [
  "Check that the name on the title matches the seller's photo ID.",
  "Check that the VIN on the title matches the VIN on the dashboard and on the driver's door sticker.",
  "Make sure the title isn't marked salvage or rebuilt, and has no lender listed (or the seller has a lien release).",
  "Meet in a busy public place in daylight. Many police stations have safe exchange spots.",
  "Test drive on local roads and the highway, from a cold start if you can.",
  "Have an independent mechanic inspect the car before you pay.",
  "Pay safely: a cashier's check or a transfer done together at your bank. Never use gift cards, wire transfers or a deposit before you've seen the car.",
  "Get a signed bill of sale with the date, price, VIN, both names and both signatures.",
  "Michigan: the seller signs the title over to you and writes in the odometer reading and sale price. Take it to a Secretary of State office within 15 days to transfer it into your name and avoid a late fee.",
  "Michigan: plates stay with the seller. Bring proof of Michigan no-fault insurance when you register the car.",
];

export function assembleReport(check: CheckRecord, facts: ReportFacts, words: ReportWords, writer: Report["writer"], now = new Date()): Report {
  const { pricing, comps, compsSearch, scam, recalls, input } = check;

  const verdict: ReportBlock[] = [{ type: "p", text: facts.verdictLine }, { type: "p", text: words.verdict_why }];
  if (facts.lowConfidenceReason) verdict.push({ type: "p", text: `Low confidence: ${facts.lowConfidenceReason}` });

  const numbers: ReportBlock[] = [];
  if (pricing.fairLow !== null) {
    const rows = [
      ["Fair range", `${usd(pricing.fairLow)} – ${usd(pricing.fairHigh!)}`],
      ["Typical price (median)", usd(pricing.median!)],
    ];
    if (facts.showOffers) {
      rows.push(["Target offer (open with this)", usd(pricing.target!)]);
      rows.push(["Walk-away price (don't pay more)", usd(pricing.walkAway!)]);
    }
    rows.push(["Asking price", usd(input.asking)]);
    numbers.push({ type: "table", head: ["", ""], rows });
  }
  if (!facts.showOffers) {
    numbers.push({
      type: "p",
      text: `We're not giving a target offer for this car. ${facts.lowConfidenceReason ?? ""} Use the questions below and a mechanic's inspection to decide what it's worth to you.`.trim(),
    });
  }
  if (comps.length) {
    numbers.push({
      type: "p",
      text: `Similar cars for sale within ${compsSearch.radiusMiles} miles (model years ${input.year - compsSearch.yearWindow}–${input.year + compsSearch.yearWindow}):`,
    });
    numbers.push({
      type: "table",
      head: ["Year", "Miles", "Distance", "Price"],
      rows: comps.slice(0, 5).map((c) => [
        String(c.year ?? ""),
        c.mileage !== undefined ? int(c.mileage) : "",
        c.distanceMiles !== undefined ? `${Math.round(c.distanceMiles)} mi` : "",
        usd(c.price),
      ]),
    });
  }

  const triggered = scam.rules.filter((r) => r.triggered);
  const scamBlocks: ReportBlock[] = [{ type: "p", text: `Scam risk: ${scam.risk[0].toUpperCase()}${scam.risk.slice(1)}` }];
  if (triggered.length) scamBlocks.push({ type: "list", items: triggered.map((r) => SCAM_LABELS[r.id as ScamRuleId]) });
  scamBlocks.push({ type: "list", items: words.scam_advice });

  const redFlags: ReportBlock[] = [{ type: "p", text: words.red_flags_summary }];
  if (recalls.length) {
    redFlags.push({
      type: "list",
      items: recalls.map((r) => `${r.component.toLowerCase()}: ${r.summary}`),
    });
  }
  redFlags.push({ type: "p", text: "What to check:" });
  redFlags.push({ type: "list", items: words.inspect });
  redFlags.push({ type: "p", text: words.inspection_advice });

  const m = words.messages;
  const blocks: Record<ReportSection["id"], ReportBlock[]> = {
    verdict,
    numbers,
    scam: scamBlocks,
    red_flags: redFlags,
    messages: [
      { type: "message", label: "Before you meet", text: m.pre_meeting_questions },
      { type: "message", label: "Your opening offer", text: m.opening_offer },
      { type: "message", label: "If they say the price is firm", text: m.price_is_firm },
      { type: "message", label: "If they counteroffer", text: m.counteroffer },
      { type: "message", label: "If you walk away", text: m.walk_away },
    ],
    checklist: [{ type: "list", items: MEETUP_CHECKLIST }],
    next_step: [{ type: "p", text: words.next_step }],
  };

  return {
    sections: SECTION_ORDER.map((s) => ({ ...s, body: blocks[s.id] })),
    writer,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Model call.

const str = { type: "string" };
const WORDS_SCHEMA = {
  type: "object",
  properties: {
    verdict_why: str,
    scam_advice: { type: "array", items: str },
    red_flags_summary: str,
    inspect: { type: "array", items: str },
    inspection_advice: str,
    messages: {
      type: "object",
      properties: {
        pre_meeting_questions: str,
        opening_offer: str,
        price_is_firm: str,
        counteroffer: str,
        walk_away: str,
      },
      required: ["pre_meeting_questions", "opening_offer", "price_is_firm", "counteroffer", "walk_away"],
      additionalProperties: false,
    },
    next_step: str,
  },
  required: ["verdict_why", "scam_advice", "red_flags_summary", "inspect", "inspection_advice", "messages", "next_step"],
  additionalProperties: false,
};

export const REPORT_SYSTEM = [
  "You write the words for a used-car buyer's Deal Kit. The buyer is dealing with a private seller and may be a first-time buyer.",
  "Write plain language in short sentences. Be friendly and direct.",
  "Numbers: use only the figures given in DATA, written exactly as given. Never estimate, calculate or invent a price, percentage or statistic.",
  "Messages to the seller sound like a real person texting: short, friendly and firm. The opening offer uses target_offer exactly. Never suggest paying more than walk_away. If target_offer is null, don't name an offer price; if walk_away is null, don't name a maximum.",
  "verdict_why: one to three sentences on why the verdict is what it is. scam_advice: one practical step per triggered flag, or one line of general caution if none. red_flags_summary: two or three sentences on the recalls and complaints given. inspect: three to six specific things to check on this car. inspection_advice: one sentence on whether a pre-purchase inspection is strongly recommended. next_step: one sentence.",
  "Return only the requested fields. Don't include your reasoning.",
  UNTRUSTED_NOTE,
].join("\n");

export function factsForModel(check: CheckRecord, facts: ReportFacts) {
  const { pricing, scam, recalls, complaints, input, comps, compsSearch, vin } = check;
  return {
    car: facts.car,
    mileage: `${int(input.mileage)} miles`,
    asking: usd(input.asking),
    verdict: pricing.verdict,
    verdict_line: facts.verdictLine,
    confidence: pricing.confidence,
    low_confidence_reason: facts.lowConfidenceReason,
    fair_range: pricing.fairLow !== null ? `${usd(pricing.fairLow)} to ${usd(pricing.fairHigh!)}` : null,
    median: pricing.median !== null ? usd(pricing.median) : null,
    target_offer: facts.showOffers ? usd(pricing.target!) : null,
    walk_away: facts.showOffers ? usd(pricing.walkAway!) : null,
    similar_cars_found: comps.length,
    search_radius: `${compsSearch.radiusMiles} miles`,
    scam_risk: scam.risk,
    scam_flags: scam.rules.filter((r) => r.triggered).map((r) => SCAM_LABELS[r.id as ScamRuleId]),
    vin_decoded: vin ? carName(vin) : null,
    recalls: recalls.map((r) => ({ component: r.component, summary: r.summary })),
    complaint_areas: complaints.map((c) => c.component),
  };
}

function collectStrings(words: ReportWords): string {
  const m = words.messages;
  return [
    words.verdict_why,
    ...words.scam_advice,
    words.red_flags_summary,
    ...words.inspect,
    words.inspection_advice,
    m.pre_meeting_questions,
    m.opening_offer,
    m.price_is_firm,
    m.counteroffer,
    m.walk_away,
    words.next_step,
  ].join("\n");
}

/** Problems with model output: unverified $ figures or any percentage. */
export function wordsProblems(words: ReportWords, facts: ReportFacts): string[] {
  const text = collectStrings(words);
  const problems = findUnverifiedNumbers(text, facts.allowedDollars).map((f) => `unverified figure ${f}`);
  if (/\d\s?%|\bpercent\b/i.test(text)) problems.push("percentage");
  return problems;
}

function isWords(x: unknown): x is ReportWords {
  const w = x as ReportWords;
  return (
    !!w &&
    typeof w.verdict_why === "string" &&
    Array.isArray(w.scam_advice) &&
    Array.isArray(w.inspect) &&
    typeof w.messages?.opening_offer === "string" &&
    typeof w.next_step === "string"
  );
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

export type GenerateResult = { report: Report; usage: { inputTokens: number; outputTokens: number } };

export async function generateReport(
  check: CheckRecord,
  deps: { client?: Anthropic; now?: Date } = {},
): Promise<GenerateResult> {
  const facts = buildFacts(check);
  const usage = { inputTokens: 0, outputTokens: 0 };
  const template = () => ({ report: assembleReport(check, facts, templateWords(check, facts), "template", deps.now), usage });

  if (!deps.client && !hasAnthropicKey()) return template();
  const client = deps.client ?? new Anthropic();

  const parts = [`DATA:\n${JSON.stringify(factsForModel(check, facts), null, 2)}`];
  if (check.input.listingText) parts.push(`Listing text from the buyer:\n${wrapUntrusted(check.input.listingText)}`);
  parts.push("Write the Deal Kit fields for this car.");
  const content = parts.join("\n\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: REPORT_MAX_TOKENS,
        system: REPORT_SYSTEM,
        output_config: { effort: REPORT_EFFORT, format: { type: "json_schema", schema: WORDS_SCHEMA } },
        messages: [{ role: "user", content }],
      });
    } catch (err) {
      console.error("[report] model call failed, using template", err);
      return template();
    }
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;

    if (response.stop_reason === "refusal") return template();

    let words: unknown;
    try {
      words = JSON.parse(textOf(response));
    } catch {
      continue;
    }
    if (!isWords(words)) continue;
    const problems = wordsProblems(words, facts);
    if (problems.length === 0) {
      return { report: assembleReport(check, facts, words, "model", deps.now), usage };
    }
    console.warn("[report] model output failed the number check:", problems.join(", "));
  }
  return template();
}

export function costFor(check: CheckRecord, usage: GenerateResult["usage"]): CostLog {
  const tokenUsd =
    (usage.inputTokens * MODEL_USD_PER_MTOK.input + usage.outputTokens * MODEL_USD_PER_MTOK.output) / 1_000_000;
  const dataUsd = check.dataCalls.marketcheck * marketcheckUsdPerCall();
  return {
    dataCalls: check.dataCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedUsd: Math.round((tokenUsd + dataUsd) * 10000) / 10000,
  };
}
