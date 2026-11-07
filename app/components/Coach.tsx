"use client";

import { useId, useState } from "react";
import CopyButton from "./CopyButton";
import styles from "./Flow.module.css";

export type CoachTurn = { role: "seller" | "coach"; text: string; stop: boolean; tip?: string };

export default function Coach({
  orderId,
  initial,
  open,
  closesLabel,
}: {
  orderId: string;
  initial: CoachTurn[];
  open: boolean;
  closesLabel: string;
}) {
  const uid = useId();
  const [turns, setTurns] = useState<CoachTurn[]>(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) {
      setError("Paste the seller's message first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, message: text }),
      });
      const data = (await res.json()) as { reply?: string; tip?: string; stop?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((t) => [
        ...t,
        { role: "seller", text, stop: false },
        data.stop
          ? { role: "coach", text: data.tip ?? "", stop: true }
          : { role: "coach", text: data.reply ?? "", stop: false, tip: data.tip },
      ]);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="coach" className={`${styles.card} ${styles.section}`} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className={styles.h2}>
        Reply coach
      </h2>
      <p className={styles.muted}>
        Paste the seller&rsquo;s latest message and get your next reply. It keeps you at or below your walk-away price.{" "}
        {closesLabel}
      </p>

      {turns.length > 0 && (
        <ol className={styles.thread} aria-label="Conversation">
          {turns.map((t, i) => (
            <li key={i} className={t.role === "seller" ? styles.bubbleSeller : t.stop ? styles.bubbleStop : styles.bubbleCoach}>
              <p className={styles.bubbleLabel}>
                {t.role === "seller" ? "Seller said" : t.stop ? "Stop: warning signs" : "Your reply"}
              </p>
              <p className={styles.messageText}>{t.text}</p>
              {t.role === "coach" && !t.stop && (
                <>
                  {t.tip && <p className={styles.tip}>{t.tip}</p>}
                  <CopyButton text={t.text} label="Copy reply" />
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {open ? (
        <form onSubmit={send} noValidate>
          <div className={styles.field}>
            <label htmlFor={`${uid}-msg`} className={styles.label}>
              Seller&rsquo;s latest message
            </label>
            <textarea
              id={`${uid}-msg`}
              className={`${styles.input} ${styles.textarea}`}
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Paste what the seller wrote."
            />
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button type="submit" className={`btn btn-primary btn-block ${styles.formButton}`} disabled={busy}>
            {busy ? "Writing your reply…" : "Write my reply"}
          </button>
        </form>
      ) : (
        <p className={styles.notice}>The reply coach was available for 7 days after purchase and has now closed.</p>
      )}
    </section>
  );
}
