// POST /api/check — run the free check and return its id.
// Body: CheckInputRaw (year, make, model, trim, mileage, asking, zip, vin, listingText)

import { allowFreeCheck, runCheck } from "@/lib/check";
import { clientIp } from "@/lib/rateLimit";
import { validateCheckInput, type CheckInputRaw } from "@/lib/validation";

export const runtime = "nodejs";

const FIELDS = ["year", "make", "model", "trim", "mileage", "asking", "zip", "vin", "listingText"] as const;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send the car details as JSON." }, { status: 400 });
  }

  const raw: CheckInputRaw = {};
  for (const k of FIELDS) if (body[k] !== undefined && body[k] !== null) raw[k] = String(body[k]);

  const result = validateCheckInput(raw);
  if (!result.ok) return Response.json({ error: "Some details need fixing.", errors: result.errors }, { status: 400 });

  if (!(await allowFreeCheck(clientIp(req.headers)))) {
    return Response.json(
      { error: "You've used your 3 free checks for today. Come back tomorrow for more." },
      { status: 429 },
    );
  }

  try {
    const check = await runCheck(result.value);
    return Response.json({ id: check.id });
  } catch (err) {
    console.error("[check] failed", err);
    return Response.json({ error: "Something went wrong running the check. Try again." }, { status: 500 });
  }
}
