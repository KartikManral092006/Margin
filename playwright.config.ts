import { defineConfig, devices } from "@playwright/test";

// P0 gate: the core loop in two browsers. Runs its own dev server on port 3100 with Nexconn
// and email switched off: sign-in links are read from the server log and doubts arrive by
// polling, so the test needs no keys and spends no quota.
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
export const E2E_LOG = ".e2e/dev.log";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    // The Chrome already installed on the machine (also on GitHub's runners): no download.
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: {
    command: `node -e "require('node:fs').rmSync('.next-e2e',{recursive:true,force:true});require('node:fs').mkdirSync('.e2e',{recursive:true})" && next dev -H localhost -p ${PORT} > ${E2E_LOG} 2>&1`,
    url: `${BASE_URL}/api/health`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      // Magic links are logged (not emailed) only in development; CI sets NODE_ENV=test.
      NODE_ENV: "development",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: BASE_URL,
      EMAIL_API_KEY: "",
      EMAIL_FROM: "",
      NEXCONN_APP_KEY: "",
      NEXCONN_APP_SECRET: "",
      NEXCONN_DEV_ROUTES: "0",
    },
  },
});
