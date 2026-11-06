import Link from "next/link";
import { validateCheckInput, type CheckInputRaw } from "@/lib/validation";
import styles from "./page.module.css";

export const metadata = { title: "Your free verdict · DealCheck" };

// Placeholder: the real free verdict (VIN → comps → recalls → pricing → scam
// rules) replaces this once /api/check is built.
export default async function CheckPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw: CheckInputRaw = {};
  for (const key of ["year", "make", "model", "trim", "mileage", "asking", "zip", "vin", "listingText"] as const) {
    const v = sp[key];
    raw[key] = Array.isArray(v) ? v[0] : v;
  }
  const result = validateCheckInput(raw);

  return (
    <main className={styles.main}>
      <div className="container">
        <Link href="/" className={styles.back}>
          ← Back to DealCheck
        </Link>
        {result.ok ? (
          <div className={styles.card}>
            <h1 className={styles.h1}>
              {result.value.year} {result.value.make} {result.value.model}
              {result.value.trim ? ` ${result.value.trim}` : ""}
            </h1>
            <p className={styles.meta}>
              {result.value.mileage.toLocaleString()} mi · asking ${result.value.asking.toLocaleString()} · ZIP{" "}
              {result.value.zip}
            </p>
            <p className={styles.note}>The free price verdict is coming in the next build step.</p>
          </div>
        ) : (
          <div className={styles.card}>
            <h1 className={styles.h1}>Some details are missing</h1>
            <p className={styles.note}>Go back and check the car details, then try again.</p>
            <Link href="/#check" className="btn btn-primary">
              Check this car — free
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
