"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import SpotlightCard from "./SpotlightCard";
import { compressImage } from "./compressImage";
import { detectSource, parseListingUrl } from "@/lib/listing/source";
import {
  LISTING_TEXT_MAX,
  maxModelYear,
  validateCheckInput,
  type CheckInputRaw,
  type FieldErrors,
} from "@/lib/validation";
import styles from "./CheckForm.module.css";

// Keep the card on the design tokens; the spotlight only adds the light.
const CARD_SURFACE = {
  "--spotlight-card-surface": "var(--surface)",
  "--spotlight-card-border": "var(--border)",
  "--spotlight-card-shadow": "0 1px 2px rgba(15, 27, 51, 0.06), 0 8px 24px rgba(15, 27, 51, 0.08)",
} as React.CSSProperties;

type FieldName = keyof CheckInputRaw;
type Mode = "link" | "screens" | "manual";

const EMPTY: Required<CheckInputRaw> = {
  year: "",
  make: "",
  model: "",
  trim: "",
  mileage: "",
  asking: "",
  zip: "",
  vin: "",
  listingText: "",
};

const REQUIRED: FieldName[] = ["year", "make", "model", "mileage", "asking", "zip"];
const MAX_SCREENSHOTS = 4;

const TABS: { mode: Mode; label: string }[] = [
  { mode: "link", label: "Paste link" },
  { mode: "screens", label: "Screenshots" },
  { mode: "manual", label: "Type it in" },
];

type ListingResponse =
  | { ok: true; source: string; fields: Partial<CheckInputRaw>; dropped: string[]; listingText: string }
  | { ok: false; reason: string; message: string };

export default function CheckForm() {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>("link");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showExtras, setShowExtras] = useState(false);

  const [link, setLink] = useState("");
  const [shots, setShots] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<{ from: "link" | "screenshots"; missing: FieldName[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const id = (name: FieldName) => `${uid}-${name}`;
  const errId = (name: FieldName) => `${uid}-${name}-error`;

  const linkUrl = parseListingUrl(link);
  const isFacebookLink = linkUrl ? detectSource(linkUrl) === "facebook" : false;

  const previews = useMemo(() => shots.map((f) => URL.createObjectURL(f)), [shots]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function switchMode(next: Mode) {
    setMode(next);
    setReadError(null);
  }

  function update(name: FieldName, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  }

  function focusField(name: FieldName) {
    // Wait a tick so the field is rendered before focusing.
    requestAnimationFrame(() => document.getElementById(id(name))?.focus());
  }

  function applyPrefill(data: Extract<ListingResponse, { ok: true }>, from: "link" | "screenshots") {
    const next = { ...EMPTY, zip: values.zip };
    for (const key of Object.keys(EMPTY) as FieldName[]) {
      const v = data.fields[key];
      if (key !== "zip" && typeof v === "string" && v) next[key] = v;
    }
    if (data.listingText) next.listingText = data.listingText.slice(0, LISTING_TEXT_MAX);
    const missing = REQUIRED.filter((k) => !next[k]);
    setValues(next);
    setErrors({});
    setPrefilled({ from, missing });
    if (next.vin) setShowExtras(true);
    setMode("manual");
    if (missing[0]) focusField(missing[0]);
  }

  async function readListing(body: BodyInit, headers: HeadersInit | undefined, from: "link" | "screenshots") {
    setReading(true);
    setReadError(null);
    try {
      const res = await fetch("/api/listing", { method: "POST", body, headers });
      const data = (await res.json()) as ListingResponse;
      if (!data.ok) {
        setReadError(data.message);
        return;
      }
      applyPrefill(data, from);
    } catch {
      setReadError("Something went wrong reading that listing. Try again, or enter the details.");
    } finally {
      setReading(false);
    }
  }

  function onSubmitLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkUrl) {
      setReadError("Paste the link to the listing, like craigslist.org/… or offerup.com/…");
      return;
    }
    if (isFacebookLink) return; // the inline notice already explains what to do
    void readListing(JSON.stringify({ url: link }), { "Content-Type": "application/json" }, "link");
  }

  function onPickShots(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    event.target.value = "";
    setReadError(null);
    setShots((prev) => [...prev, ...picked].slice(0, MAX_SCREENSHOTS));
  }

  async function onSubmitShots(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (shots.length === 0) {
      setReadError("Add at least one screenshot of the listing.");
      return;
    }
    setReading(true);
    const form = new FormData();
    for (const [i, file] of shots.entries()) {
      const blob = await compressImage(file);
      form.append("images", blob, `screenshot-${i + 1}.${blob.type === "image/jpeg" ? "jpg" : "png"}`);
    }
    await readListing(form, undefined, "screenshots");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateCheckInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.vin || result.errors.listingText) setShowExtras(true);
      const first = (Object.keys(EMPTY) as FieldName[]).find((k) => result.errors[k]);
      if (first) focusField(first);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.value),
      });
      const data = (await res.json()) as { id?: string; error?: string; errors?: FieldErrors };
      if (!res.ok || !data.id) {
        if (data.errors) setErrors(data.errors);
        throw new Error(data.error ?? "Something went wrong. Try again.");
      }
      router.push(`/check/${data.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  function field(
    name: FieldName,
    label: string,
    opts: {
      optional?: boolean;
      placeholder?: string;
      numeric?: boolean;
      autoComplete?: string;
      maxLength?: number;
      prefix?: string;
      className?: string;
    } = {},
  ) {
    const error = errors[name];
    const needsInput = prefilled?.missing.includes(name) && !values[name];
    return (
      <div className={`${styles.field} ${opts.className ?? ""}`}>
        <label htmlFor={id(name)} className={styles.label}>
          {label}
          {opts.optional && <span className={styles.optional}> (optional)</span>}
        </label>
        <div className={opts.prefix ? styles.prefixWrap : undefined}>
          {opts.prefix && (
            <span className={styles.prefix} aria-hidden="true">
              {opts.prefix}
            </span>
          )}
          <input
            id={id(name)}
            name={name}
            type="text"
            inputMode={opts.numeric ? "numeric" : undefined}
            autoComplete={opts.autoComplete ?? "off"}
            placeholder={opts.placeholder}
            maxLength={opts.maxLength}
            value={values[name]}
            onChange={(e) => update(name, e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId(name) : undefined}
            className={`${styles.input} ${opts.prefix ? styles.inputPrefixed : ""} ${
              error ? styles.inputError : needsInput ? styles.inputNeeded : ""
            }`}
          />
        </div>
        {error && (
          <p id={errId(name)} className={styles.error}>
            {error}
          </p>
        )}
      </div>
    );
  }

  const panelId = (m: Mode) => `${uid}-panel-${m}`;
  const tabId = (m: Mode) => `${uid}-tab-${m}`;

  return (
    <SpotlightCard
      theme="light"
      spotlightColor="#1D4ED8"
      intensity={0.35}
      spotlightSize={280}
      borderGlow={0.9}
      className={styles.card}
      style={CARD_SURFACE}
    >
      <h2 className={styles.title}>Check a car for free</h2>
      <p className={styles.subtitle}>Paste the listing link or add screenshots. We&rsquo;ll fill in the details.</p>

      <div role="tablist" aria-label="How to add the car" className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.mode}
            id={tabId(t.mode)}
            type="button"
            role="tab"
            aria-selected={mode === t.mode}
            aria-controls={panelId(t.mode)}
            className={mode === t.mode ? styles.tabActive : styles.tab}
            onClick={() => switchMode(t.mode)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "link" && (
        <form
          id={panelId("link")}
          role="tabpanel"
          aria-labelledby={tabId("link")}
          className={styles.form}
          onSubmit={onSubmitLink}
          noValidate
        >
          <div className={styles.field}>
            <label htmlFor={`${uid}-link`} className={styles.label}>
              Listing link
            </label>
            <input
              id={`${uid}-link`}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://…craigslist.org/… or offerup.com/…"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setReadError(null);
              }}
              aria-describedby={`${uid}-link-hint`}
              className={styles.input}
            />
            <p id={`${uid}-link-hint`} className={styles.hint}>
              Works with Craigslist and OfferUp. On Facebook Marketplace? Use screenshots.
            </p>
          </div>

          {isFacebookLink && (
            <div className={styles.notice} role="status">
              <p>
                <strong>Facebook doesn&rsquo;t let us open Marketplace listings.</strong> Take screenshots of the
                listing (photos, price, mileage and description) and upload them, or type the details in.
              </p>
              <div className={styles.noticeActions}>
                <button type="button" className="btn btn-secondary" onClick={() => switchMode("screens")}>
                  Upload screenshots
                </button>
                <button type="button" className={styles.linkButton} onClick={() => switchMode("manual")}>
                  Type it in
                </button>
              </div>
            </div>
          )}

          {readError && (
            <p className={styles.error} role="alert">
              {readError}
            </p>
          )}

          {!isFacebookLink && (
            <button type="submit" className="btn btn-primary btn-block" disabled={reading}>
              {reading ? "Reading the listing…" : "Get car details"}
            </button>
          )}
        </form>
      )}

      {mode === "screens" && (
        <form
          id={panelId("screens")}
          role="tabpanel"
          aria-labelledby={tabId("screens")}
          className={styles.form}
          onSubmit={onSubmitShots}
          noValidate
        >
          <p className={styles.hint}>
            Screenshot the listing: the title and price, the mileage, and the description. Up to {MAX_SCREENSHOTS}.
          </p>

          {shots.length > 0 && (
            <ul className={styles.shots} aria-label="Screenshots added">
              {shots.map((file, i) => (
                <li key={`${file.name}-${i}`} className={styles.shot}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                  <img src={previews[i]} alt={`Screenshot ${i + 1}`} className={styles.shotImg} />
                  <button
                    type="button"
                    className={styles.shotRemove}
                    aria-label={`Remove screenshot ${i + 1}`}
                    onClick={() => setShots((s) => s.filter((_, j) => j !== i))}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <input
            ref={fileInput}
            id={`${uid}-shots`}
            type="file"
            accept="image/*"
            multiple
            className="visually-hidden"
            onChange={onPickShots}
            tabIndex={-1}
          />
          {shots.length < MAX_SCREENSHOTS && (
            <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInput.current?.click()}>
              {shots.length === 0 ? "Add screenshots" : "Add another"}
            </button>
          )}

          {readError && (
            <p className={styles.error} role="alert">
              {readError}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={reading || shots.length === 0}>
            {reading ? "Reading your screenshots…" : "Get car details"}
          </button>
        </form>
      )}

      {mode === "manual" && (
        <form
          id={panelId("manual")}
          role="tabpanel"
          aria-labelledby={tabId("manual")}
          className={styles.form}
          onSubmit={onSubmit}
          noValidate
        >
          {prefilled && (
            <div className={styles.notice} role="status">
              <p>
                <strong>We filled in what we found in the {prefilled.from === "link" ? "listing" : "screenshots"}.</strong>{" "}
                Check every field before you continue.
                {prefilled.missing.length > 0 && " Add anything that's still empty."}
              </p>
            </div>
          )}

          <div className={styles.grid}>
            {field("year", "Year", {
              numeric: true,
              placeholder: String(maxModelYear() - 8),
              maxLength: 4,
            })}
            {field("make", "Make", { placeholder: "Honda", maxLength: 40 })}
            {field("model", "Model", { placeholder: "Civic", maxLength: 60 })}
            {field("trim", "Trim", { optional: true, placeholder: "EX", maxLength: 60 })}
            {field("mileage", "Mileage", { numeric: true, placeholder: "84,000", maxLength: 9 })}
            {field("asking", "Asking price", {
              numeric: true,
              placeholder: "9,500",
              prefix: "$",
              maxLength: 10,
            })}
            {field("zip", "Your ZIP code", {
              numeric: true,
              placeholder: "48104",
              maxLength: 5,
              autoComplete: "postal-code",
              className: styles.full,
            })}
          </div>

          <button
            type="button"
            className={styles.extrasToggle}
            aria-expanded={showExtras}
            aria-controls={`${uid}-extras`}
            onClick={() => setShowExtras((s) => !s)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className={showExtras ? styles.chevOpen : styles.chev}>
              <path d="M7 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {values.listingText ? "VIN and listing text (used for the scam check)" : "Add VIN or listing text for a scam check"}
          </button>

          <div id={`${uid}-extras`} hidden={!showExtras} className={styles.extras}>
            {field("vin", "VIN", { optional: true, placeholder: "17 characters", maxLength: 17 })}
            <div className={styles.field}>
              <label htmlFor={id("listingText")} className={styles.label}>
                Listing text or seller messages<span className={styles.optional}> (optional)</span>
              </label>
              <textarea
                id={id("listingText")}
                name="listingText"
                rows={4}
                maxLength={LISTING_TEXT_MAX}
                value={values.listingText}
                onChange={(e) => update("listingText", e.target.value)}
                aria-describedby={`${uid}-listingText-hint`}
                className={`${styles.input} ${styles.textarea}`}
                placeholder="Paste the listing description or what the seller said."
              />
              <p id={`${uid}-listingText-hint`} className={styles.hint}>
                {values.listingText.length.toLocaleString()} / {LISTING_TEXT_MAX.toLocaleString()} characters
              </p>
            </div>
          </div>

          {submitError && (
            <p className={styles.error} role="alert">
              {submitError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "Checking…" : "Check this car — free"}
          </button>
        </form>
      )}

      <p className={styles.fine}>No account needed. 3 free checks a day.</p>
    </SpotlightCard>
  );
}
