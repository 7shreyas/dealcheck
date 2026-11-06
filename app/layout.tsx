import type { Metadata, Viewport } from "next";
import { Urbanist } from "next/font/google";
import "./globals.css";

const urbanist = Urbanist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-urbanist",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "DealCheck: Is that used car a good deal?",
  description:
    "Buying a used car from a private seller on Facebook Marketplace, Craigslist or OfferUp? Get a free price verdict in under a minute.",
  openGraph: {
    title: "DealCheck: Is that used car a good deal?",
    description:
      "Free price verdict for private-seller used cars. Fair price, scam check and what to say to the seller.",
    type: "website",
    siteName: "DealCheck",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F1B33",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body>{children}</body>
    </html>
  );
}
