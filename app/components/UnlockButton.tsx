"use client";

import { useState } from "react";
import styles from "./Flow.module.css";

export default function UnlockButton({ checkId, label }: { checkId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't start checkout. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.unlock}>
      <button type="button" className="btn btn-primary btn-block" onClick={unlock} disabled={busy}>
        {busy ? "Opening checkout…" : label}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
