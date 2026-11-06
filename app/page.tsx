import Link from "next/link";
import CheckForm from "./components/CheckForm";
import SpotlightCard from "./components/SpotlightCard";
import styles from "./page.module.css";

// Keep the sample on the design tokens; the spotlight only adds the light.
const SAMPLE_SURFACE = {
  "--spotlight-card-surface": "var(--surface)",
  "--spotlight-card-border": "var(--border)",
  "--spotlight-card-shadow": "0 8px 24px rgba(15, 27, 51, 0.08)",
} as React.CSSProperties;

const DEAL_KIT = [
  {
    title: "Fair price range",
    body: "What similar cars near you actually sell for, with the comps we used.",
  },
  {
    title: "Target and walk-away offers",
    body: "The number to open with and the number where you stop and leave.",
  },
  {
    title: "Scam check",
    body: "We scan the listing for the warning signs behind most Marketplace scams.",
  },
  {
    title: "Red flags for this model",
    body: "Open recalls, common problems at this mileage, and what to inspect.",
  },
  {
    title: "Messages to send the seller",
    body: "Ready-to-send texts: questions, your offer, and replies to “price is firm.”",
  },
  {
    title: "Meetup and payment checklist",
    body: "Match the title, ID and VIN, pay safely, and transfer the title correctly.",
  },
  {
    title: "7-day reply coach",
    body: "Paste what the seller said back. We write your next message.",
  },
];

const FAQ = [
  {
    q: "Is the price check really free?",
    a: "Yes. You get the verdict and fair price range for free, with no account. You can do 3 free checks a day. The full Deal Kit is a one-time $29.",
  },
  {
    q: "Where do the prices come from?",
    a: "We compare your car with similar listings near your ZIP code: same model, close in year and mileage. All the math is done by our code, not guessed by AI.",
  },
  {
    q: "Does this work for dealer cars?",
    a: "No. DealCheck is built for buying from a private seller on Facebook Marketplace, Craigslist or OfferUp. Dealer pricing and fees work differently.",
  },
  {
    q: "Do I still need a mechanic?",
    a: "Yes. DealCheck helps you avoid overpaying and spot scams, but it can't see the car. We tell you when a pre-purchase inspection is strongly recommended.",
  },
  {
    q: "What does the reply coach do?",
    a: "For 7 days after you buy the Deal Kit, paste in the seller's latest message and get a short, friendly reply that keeps you at or below your walk-away price. If the message looks like a scam, it tells you to stop and why.",
  },
];

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={styles.checkIcon}>
      <circle cx="12" cy="12" r="11" fill="#E3EAFB" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const STEPS = [
  {
    title: "Add the listing",
    body: "Paste a Craigslist or OfferUp link, or upload screenshots from Facebook Marketplace. We fill in the details for you to check.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 15l1.6-5.2A2 2 0 017.5 8.4h9a2 2 0 011.9 1.4L20 15v3a1 1 0 01-1 1h-1.5a1 1 0 01-1-1v-1h-9v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="7.5" cy="14" r="1.2" fill="currentColor" />
        <circle cx="16.5" cy="14" r="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Get a free price verdict",
    body: "See if the price is fair, too high or suspiciously low, plus the fair range for cars like it near you.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="5.5" y="11" width="3" height="6" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="10.5" y="7" width="3" height="10" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="15.5" y="9" width="3" height="8" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    title: "Unlock the Deal Kit",
    body: "For $29, get your offer numbers, a scam check, messages to send, and a coach for the back-and-forth.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h10l4 4v12H5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8.5 12.5l2.3 2.3 4.7-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <Link href="/" className={styles.wordmark} aria-label="DealCheck home">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
              <rect width="24" height="24" rx="6" fill="#1D4ED8" />
              <path d="M6.5 12.5l3.5 3.5 7.5-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            DealCheck
          </Link>
          <a href="#check" className={styles.headerLink}>
            Check a car
          </a>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>For private-seller used cars</p>
              <h1 className={styles.h1}>Know if that used car is a good deal before you message the seller.</h1>
              <p className={styles.lede}>
                Found a car on Facebook Marketplace, Craigslist or OfferUp? Paste the link or a few screenshots and
                get a free price verdict based on similar cars near you.
              </p>
              <ul className={styles.heroPoints}>
                <li>
                  <CheckIcon /> Fair price range from local comps
                </li>
                <li>
                  <CheckIcon /> Flags listings that look like scams
                </li>
                <li>
                  <CheckIcon /> Free, no account needed
                </li>
              </ul>
            </div>
            <div id="check" className={styles.heroForm}>
              <CheckForm />
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="how-heading">
          <div className="container">
            <h2 id="how-heading" className={styles.h2}>
              How it works
            </h2>
            <ol className={styles.steps}>
              {STEPS.map((step) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepIcon}>{step.icon}</span>
                  <h3 className={styles.h3}>{step.title}</h3>
                  <p className={styles.muted}>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLight}`} aria-labelledby="sample-heading">
          <div className={`container ${styles.split}`}>
            <div>
              <h2 id="sample-heading" className={styles.h2}>
                What your free verdict looks like
              </h2>
              <p className={styles.sectionLede}>
                A clear answer up front: is the asking price fair, and what do similar cars nearby sell for? The
                rest of the Deal Kit unlocks for $29.
              </p>
            </div>

            <figure className={styles.sample} aria-label="Example verdict for a 2017 Honda Civic EX">
              <figcaption className={styles.sampleTag}>Example</figcaption>
              <SpotlightCard
                theme="light"
                spotlightColor="#1D4ED8"
                intensity={0.35}
                spotlightSize={280}
                borderGlow={0.9}
                className={styles.sampleCard}
                style={SAMPLE_SURFACE}
              >
                <p className={styles.sampleCar}>2017 Honda Civic EX · 84,000 mi · asking $13,900</p>
                <p className={styles.sampleVerdict}>Overpriced by about $1,200</p>
                <div className={styles.sampleRange}>
                  <span className={styles.sampleRangeLabel}>Fair range near 48104</span>
                  <span className={styles.sampleRangeValue}>$11,800 – $13,300</span>
                </div>
                <ul className={styles.lockedList}>
                  {["Target and walk-away offers", "Scam check", "Messages to send the seller"].map((row) => (
                    <li key={row} className={styles.lockedRow}>
                      <span className={styles.lockedName}>
                        <LockIcon /> {row}
                      </span>
                      <span className={styles.lockedTag}>Unlock</span>
                    </li>
                  ))}
                </ul>
              </SpotlightCard>
            </figure>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="kit-heading">
          <div className="container">
            <h2 id="kit-heading" className={styles.h2}>
              What&rsquo;s in the $29 Deal Kit
            </h2>
            <p className={styles.sectionLede}>Everything you need to make an offer and buy safely.</p>
            <ul className={styles.kit}>
              {DEAL_KIT.map((item) => (
                <li key={item.title} className={styles.kitItem}>
                  <CheckIcon />
                  <div>
                    <h3 className={styles.h3}>{item.title}</h3>
                    <p className={styles.muted}>{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionDark}`} aria-labelledby="pricing-heading">
          <div className="container">
            <h2 id="pricing-heading" className={styles.h2}>
              Simple pricing
            </h2>
            <p className={styles.sectionLedeDark}>One small payment, often less than the first $100 you talk the seller down.</p>
            <div className={styles.plans}>
              <div className={styles.plan}>
                <h3 className={styles.planName}>Price verdict</h3>
                <p className={styles.planPrice}>Free</p>
                <ul className={styles.planList}>
                  <li>Fair, overpriced or suspiciously cheap</li>
                  <li>Fair price range near you</li>
                  <li>3 checks a day</li>
                </ul>
                <a href="#check" className="btn btn-secondary btn-block">
                  Check a car
                </a>
              </div>
              <div className={`${styles.plan} ${styles.planFeatured}`}>
                <h3 className={styles.planName}>Deal Kit</h3>
                <p className={styles.planPrice}>
                  $29 <span className={styles.planUnit}>one-time</span>
                </p>
                <ul className={styles.planList}>
                  <li>Target and walk-away offers</li>
                  <li>Scam check and model red flags</li>
                  <li>Messages to send the seller</li>
                  <li>Meetup and payment checklist</li>
                  <li>7-day reply coach</li>
                </ul>
                <a href="#check" className="btn btn-primary btn-block">
                  Get my Deal Kit
                </a>
                <p className={styles.planNote}>Start with a free check. You can unlock the kit from your verdict.</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="faq-heading">
          <div className={`container ${styles.faqWrap}`}>
            <h2 id="faq-heading" className={styles.h2}>
              Questions
            </h2>
            <div className={styles.faq}>
              {FAQ.map((item) => (
                <details key={item.q} className={styles.faqItem}>
                  <summary className={styles.faqQ}>{item.q}</summary>
                  <p className={styles.faqA}>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className="container">
          <p className={styles.footerBrand}>DealCheck</p>
          <p className={styles.footerText}>
            Not affiliated with Facebook, Meta or Craigslist. Price estimates are guidance, not a guarantee of value.
          </p>
          <p className={styles.footerText}>© {new Date().getFullYear()} DealCheck</p>
        </div>
      </footer>
    </>
  );
}
