import { defineConfig } from "vitest/config";

// Standalone test config (kept separate from the app's vite.config.ts, which
// has root: "client" and the local-API dev plugin). Tests run in Node.
export default defineConfig({
  test: {
    environment: "node",
    include: ["api/**/*.test.ts", "shared/**/*.test.ts", "client/src/**/*.test.{ts,tsx}"],
    // Dummy env so modules that build a Supabase client at import time don't
    // throw during tests (real network calls should be mocked per-test).
    env: {
      SUPABASE_URL: "http://localhost",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      GMAIL_USER: "test@vitumlab.com",
      BASE_URL: "https://test.vitumlab.com",
    },
  },
});
