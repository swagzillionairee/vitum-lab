import { defineConfig, devices } from "@playwright/test";

// E2E config — lives separately from Vitest (which owns api/ + client unit &
// component tests). Run with `pnpm test:e2e` (needs `npx playwright install`).
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Pin the port (vite.config has strictPort: false) so baseURL is deterministic.
    command: `pnpm exec vite --host --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Dummy Supabase env so the browser client constructs with project ref
      // "test" (storage key sb-test-auth-token, seeded per-test). Every /api/*
      // call is mocked in the spec, so no real backend is contacted.
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
