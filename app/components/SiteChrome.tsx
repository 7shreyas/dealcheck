import Link from "next/link";
import { DISCLAIMER_TEXT } from "@/lib/copy";
import styles from "./SiteChrome.module.css";

export function SiteHeader({ ctaHref = "/#check", ctaLabel = "Check a car" }: { ctaHref?: string; ctaLabel?: string }) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href="/" className={styles.wordmark} aria-label="DealCheck home">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#1D4ED8" />
            <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          DealCheck
        </Link>
        <a href={ctaHref} className={styles.headerLink}>
          {ctaLabel}
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.footerBrand}>DealCheck</p>
        <p className={styles.footerText}>{DISCLAIMER_TEXT}</p>
        <p className={styles.footerText}>© {new Date().getFullYear()} DealCheck</p>
      </div>
    </footer>
  );
}
