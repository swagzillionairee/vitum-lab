import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

// ─── Local API handler (dev only) ────────────────────────────────────────────
// Routes /api/* requests to the Vercel serverless handlers when running locally.
// Uses server.ssrLoadModule so TypeScript is transpiled through Vite's pipeline.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
function vitePluginLocalApi(): Plugin {
  const PROJECT_ROOT = import.meta.dirname;

  const ROUTES: Array<{ test: (p: string) => boolean; file: string }> = [
    { test: (p) => p.startsWith("/admin"), file: "api/admin/[...slug].ts" },
    { test: (p) => p.startsWith("/affiliate"), file: "api/affiliate/[...slug].ts" },
    { test: (p) => p.startsWith("/public"), file: "api/public/[...slug].ts" },
    { test: (p) => p === "/products", file: "api/products.ts" },
    { test: (p) => p === "/inventory", file: "api/inventory.ts" },
    { test: (p) => p === "/me", file: "api/me.ts" },
    { test: (p) => p === "/validate-discount", file: "api/validate-discount.ts" },
    { test: (p) => p.startsWith("/account"), file: "api/account/[...slug].ts" },
    { test: (p) => p === "/contact", file: "api/contact.ts" },
    { test: (p) => p === "/create-crypto-payment", file: "api/create-crypto-payment.ts" },
  ];

  return {
    name: "local-api-handler",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const rawUrl: string = req.url || "/";
        if (!rawUrl.startsWith("/api/")) return next();

        // Parse JSON body
        await new Promise<void>((resolve) => {
          const ct = req.headers["content-type"] || "";
          if (req.method === "GET" || req.method === "HEAD" || !ct.includes("application/json")) {
            req.body = {};
            return resolve();
          }
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => {
            try { req.body = JSON.parse(body); } catch { req.body = {}; }
            resolve();
          });
        });

        // Parse query string
        try {
          const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
          req.query = Object.fromEntries(new URLSearchParams(qs));
        } catch { req.query = {}; }

        const apiPath = rawUrl.replace(/\?.*$/, "").slice(4); // strip '/api'
        const route = ROUTES.find((r) => r.test(apiPath));
        if (!route) return next();

        try {
          // ssrLoadModule runs TypeScript through Vite's esbuild transform pipeline
          const mod = await server.ssrLoadModule(path.resolve(PROJECT_ROOT, route.file));
          if (typeof mod.default === "function") return mod.default(req, res);
        } catch (err) {
          console.error("[local-api]", apiPath, err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Local API error — check server console" }));
        }

        next();
      });
    },
  };
}

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(isDev ? [vitePluginLocalApi()] : [])],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
