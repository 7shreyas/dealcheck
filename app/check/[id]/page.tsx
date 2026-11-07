import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRICE_LABEL } from "@/lib/config";
import { carName, int, usd } from "@/lib/format";
import { isValidId } from "@/lib/ids";
import { buildFacts, templateWords } from "@/lib/report";
import { getStore } from "@/lib/store";
import Flow from "../../components/Flow.module.css";
import LockIcon from "../../components/LockIcon";
import { SiteFooter, SiteHeader } from "../../components/SiteChrome";
import UnlockButton from "../../components/UnlockButton";

export const metadata: Metadata = { title: "Your free verdict · DealCheck", robots: { index: false } };

const LOCKED = [
  "Target and walk-away offers",
  "Full scam check and what to do",
  "Red flags for this model",
  "Messages to send the seller",
  "Meetup and payment checklist",
  "Reply coach for 7 days",
];

export default async function VerdictPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const check = await getStore().getCheck(id);
  if (!check) notFound();

  const { pricing, input, comps, compsSearch, scam } = check;
  const facts = buildFacts(check);
  const why = templateWords(check, facts).verdict_why;

  return (
    <>
      <SiteHeader />
      <main className={Flow.main}>
        <div className={`container ${Flow.narrow}`}>
          <Link href="/#check" className={Flow.back}>
            ← Check another car
          </Link>

          <section className={Flow.card} aria-labelledby="verdict-heading">
            <p className={Flow.eyebrow}>Free price verdict</p>
            <h1 id="verdict-heading" className={Flow.h1}>
              {carName(input)}
            </h1>
            <p className={Flow.meta}>
              {int(input.mileage)} mi · asking {usd(input.asking)} · near {input.zip}
            </p>

            <div className={`${Flow.verdict} ${Flow[`verdict_${pricing.verdict}`]}`}>
              <p className={Flow.verdictLine}>{facts.verdictLine}</p>
              <p className={Flow.verdictWhy}>{why}</p>
            </div>

            {facts.lowConfidenceReason && (
              <p className={Flow.notice}>
                <strong>Low confidence.</strong> {facts.lowConfidenceReason}
                {!facts.showOffers && " Because of that, the Deal Kit won't include a target offer."}
              </p>
            )}

            {pricing.fairLow !== null && (
              <div className={Flow.range}>
                <span className={Flow.rangeLabel}>Fair range near {input.zip}</span>
                <span className={Flow.rangeValue}>
                  {usd(pricing.fairLow)} – {usd(pricing.fairHigh!)}
                </span>
                <span className={Flow.rangeNote}>
                  Based on {comps.length} similar {comps.length === 1 ? "car" : "cars"} for sale within{" "}
                  {compsSearch.radiusMiles} miles.
                  {compsSearch.source === "mock" && " Sample data: live market prices aren't connected yet."}
                </span>
              </div>
            )}

            {scam.risk === "high" && (
              <p className={Flow.warning}>
                <strong>Scam risk: high.</strong> We found warning signs in this listing. Don&rsquo;t send any money or
                a deposit before you&rsquo;ve seen the car and the title in person.
              </p>
            )}
            {scam.risk === "medium" && (
              <p className={Flow.notice}>
                <strong>Scam risk: medium.</strong> We found a warning sign in this listing. Be careful, and never pay
                before you&rsquo;ve seen the car.
              </p>
            )}

            <h2 className={`${Flow.h2} ${Flow.kitHeading}`}>
              Your Deal Kit
            </h2>
            <ul className={Flow.locked} aria-label="Included in the Deal Kit">
              {LOCKED.map((row) => (
                <li key={row} className={Flow.lockedRow}>
                  <span className={Flow.lockedName}>
                    <LockIcon /> {row}
                  </span>
                  <span className={Flow.lockedTag}>Unlock</span>
                </li>
              ))}
            </ul>
            <UnlockButton checkId={check.id} label={`Get my Deal Kit — ${PRICE_LABEL}`} />
            <p className={Flow.unlockNote}>One-time payment. Includes the reply coach for 7 days.</p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
