"use client";

import { useState } from "react";
import styles from "./Flow.module.css";

export default function CopyButton({ text, label = "Copy message" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the text is still on screen to select.
    }
  }

  return (
    <button type="button" className={styles.copy} onClick={copy} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}
