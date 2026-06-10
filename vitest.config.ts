import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone test config (kept separate from the app's vite.config.ts, which
// has root: "client" and the local-API dev plugin).
//   - Pure logic + API tests: *.test.ts run in Node.
//   - Component tests: *.test.tsx run in jsdom (via environmentMatchGlobs).
export default defineConfig({
  // Use the automatic JSX runtime so component tests don't need React in scope.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["client/src/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
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
