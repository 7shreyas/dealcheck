import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Playwright smoke test builds into its own folder so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
