import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout contre l'environnement local seedé :
 *   supabase start && supabase db reset && npm run seed && npm run build
 *   npm run e2e
 * Les liens magiques sont lus dans Mailpit (http://127.0.0.1:54324).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grep: /@desktop/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 60_000 },
  outputDir: "test-results",
});
