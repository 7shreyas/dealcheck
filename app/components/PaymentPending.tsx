"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./Flow.module.css";

const POLL_MS = 2500;
const GIVE_UP_AFTER = 24; // about a minute

/** Shown while Stripe's webhook hasn't marked the order paid yet. */
export default function PaymentPending({ checkHref }: { checkHref: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (tries >= GIVE_UP_AFTER) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [tries, router]);

  return (
    <div role="status">
      <h1 className={styles.h1}>Confirming your payment…</h1>
      {tries < GIVE_UP_AFTER ? (
        <p className={styles.p}>This usually takes a few seconds. Your Deal Kit will appear here automatically.</p>
      ) : (
        <>
          <p className={styles.p}>
            We haven&rsquo;t received the payment confirmation yet. If you completed checkout, refresh this page in a
            minute. If you didn&rsquo;t, you can go back and try again.
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-secondary" onClick={() => setTries(0)}>
              Check again
            </button>
            <a href={checkHref} className="btn btn-secondary">
              Back to your verdict
            </a>
          </div>
        </>
      )}
    </div>
  );
}
