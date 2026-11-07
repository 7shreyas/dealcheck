import { defineConfig, devices } from "@playwright/test";

// Smoke test in mock mode: DEALCHECK_OFFLINE=1 forces every service to mocks
// (no network, even if .env.local has keys). Runs on its own port and build
// folder so it works next to `npm run dev`.
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      DEALCHECK_OFFLINE: "1",
      NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`,
    },
  },
});
