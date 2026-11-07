"use client";

import { useState } from "react";
import styles from "./Flow.module.css";

export default function MockPayForm({ orderId, label }: { orderId: string; label: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, email }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Payment failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} noValidate>
      <div className={styles.field}>
        <label htmlFor="mock-email" className={styles.label}>
          Email for your Deal Kit (optional)
        </label>
        <input
          id="mock-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={`btn btn-primary btn-block ${styles.formButton}`} disabled={busy}>
        {busy ? "Processing…" : label}
      </button>
    </form>
  );
}
