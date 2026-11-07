// Scam rules (pure functions). Each rule returns { id, triggered, evidence }.
// Risk: high if a core rule (price, keywords, VIN) triggers or 3+ rules do;
// medium for 1–2; low otherwise. See CLAUDE.md and tests/scam.test.ts.

export type ScamInput = {
  asking: number;
  fairLow: number | null;
  text: string;
  listing: { year: number; make: string; model: string };
  vin?: { year: number; make: string; model: string } | null;
};

export type ScamRuleId =
  | "price_far_below_market"
  | "scam_keywords"
  | "vin_mismatch"
  | "title_problem"
  | "no_meeting_or_inspection"
  | "urgency";

export type ScamRule = { id: ScamRuleId; triggered: boolean; evidence: unknown };
export type ScamRisk = "low" | "medium" | "high";

const CORE_RULES: ScamRuleId[] = ["price_far_below_market", "scam_keywords", "vin_mismatch"];
const CHEAP_FACTOR = 0.75;

const SCAM_KEYWORDS: RegExp[] = [
  /\bdeployed\b/,
  /\bmilitary\b/,
  /\boverseas\b/,
  /\bshipping\b/,
  /\bescrow\b/,
  /\bgift ?cards?\b/,
  /\bwire(?:d)?(?: transfer| the money)?\b/,
  /\bebay (?:motors )?(?:protection|buyer protection)\b/,
  /\b(?:zelle|venmo|cash ?app|paypal)\b[^.]*\bdeposit\b/,
  /\bdeposit\b[^.]*\b(?:to hold|before)\b/,
  /\b(?:pay|payment|deposit)\b[^.]*\bbefore (?:viewing|seeing|you see)\b/,
];

const TITLE_PROBLEMS: RegExp[] = [
  /\bno title\b/,
  /\b(?:lost|missing) (?:the )?title\b/,
  /\btitle (?:is )?(?:in|under) (?:my|his|her|their|a) [\w' ]*name\b/,
  /\bnot in my name\b/,
  /\bsalvage\b/,
  /\brebuilt title\b/,
  /\bbill of sale only\b/,
];

const NO_MEETING: RegExp[] = [
  /\b(?:can't|cannot|can not|won't|unable to) meet\b/,
  /\bno (?:in[- ]person )?(?:meetings?|meetups?)\b/,
  /\bno inspections?\b/,
  /\b(?:no|won't allow|don't allow) (?:a )?mechanics?\b/,
  /\bno test drives?\b/,
];

const URGENCY: RegExp[] = [
  /\bmust sell (?:today|tonight|now|asap|this week)\b/,
  /\bfirst (?:to|come)\b[^.]*\b(?:gets|served)\b/,
  /\b(?:today|tonight) only\b/,
  /\bleaving (?:the country|town)\b/,
  /\bneed (?:it )?gone\b/,
];

const MAKE_ALIASES: Record<string, string> = {
  chevy: "chevrolet",
  vw: "volkswagen",
  mercedes: "mercedesbenz",
  benz: "mercedesbenz",
};

/** Lowercase, straight apostrophes, single spaces. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

function normalizeName(s: string): string {
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return MAKE_ALIASES[n] ?? n;
}

function matches(text: string, patterns: RegExp[]): string[] {
  return patterns.flatMap((re) => text.match(re)?.[0] ?? []);
}

function textRule(id: ScamRuleId, text: string, patterns: RegExp[]): ScamRule {
  const found = matches(text, patterns);
  return { id, triggered: found.length > 0, evidence: found.length > 0 ? found : null };
}

function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  // "F150" vs "F-150 Lariat": one may carry extra trim words.
  return x === y || (x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x)));
}

export function runScamChecks(input: ScamInput): { rules: ScamRule[]; risk: ScamRisk } {
  const text = normalizeText(input.text);
  const { asking, fairLow, listing, vin } = input;

  const cheapThreshold = fairLow === null ? null : CHEAP_FACTOR * fairLow;
  const priceRule: ScamRule = {
    id: "price_far_below_market",
    triggered: cheapThreshold !== null && asking < cheapThreshold,
    evidence: { asking, fairLow, threshold: cheapThreshold },
  };

  const vinDiffs: string[] = [];
  if (vin) {
    if (vin.year !== listing.year) vinDiffs.push(`year: listing ${listing.year}, VIN ${vin.year}`);
    if (!namesMatch(vin.make, listing.make)) vinDiffs.push(`make: listing ${listing.make}, VIN ${vin.make}`);
    if (!namesMatch(vin.model, listing.model)) vinDiffs.push(`model: listing ${listing.model}, VIN ${vin.model}`);
  }
  const vinRule: ScamRule = {
    id: "vin_mismatch",
    triggered: vinDiffs.length > 0,
    evidence: vin ? vinDiffs : null,
  };

  const rules: ScamRule[] = [
    priceRule,
    textRule("scam_keywords", text, SCAM_KEYWORDS),
    vinRule,
    textRule("title_problem", text, TITLE_PROBLEMS),
    textRule("no_meeting_or_inspection", text, NO_MEETING),
    textRule("urgency", text, URGENCY),
  ];

  const hit = rules.filter((r) => r.triggered);
  let risk: ScamRisk = "low";
  if (hit.some((r) => CORE_RULES.includes(r.id)) || hit.length >= 3) risk = "high";
  else if (hit.length > 0) risk = "medium";

  return { rules, risk };
}
