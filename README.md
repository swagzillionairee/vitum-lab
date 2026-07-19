# Vitum Lab

Vitum Lab is a React storefront for research peptides, deployed on Vercel with Supabase-backed products, inventory, orders, authentication, affiliates, and rewards.

The checkout supports Square card payments, admin-verified Zelle/Cash App/Venmo/ACH transfers, and NowPayments crypto. Prices, discounts, store credit, inventory, and payment state are calculated or verified server-side.

## Stack

- React 19, TypeScript, Tailwind CSS 4, Wouter, and Vite
- Vercel static hosting and serverless API routes
- Supabase Postgres, Auth, Storage, RLS, and RPCs
- Vitest unit/component tests and Playwright checkout tests

## Local development

Use the package-manager version declared in `package.json`; newer pnpm releases may not read this repository's override configuration correctly.

```bash
npx --yes pnpm@10.34.4 install --frozen-lockfile
npx --yes pnpm@10.34.4 dev
```

The Vite development server runs on port 3000 and loads local environment values from `.env.local`. See `AGENTS.md` for the current environment-variable inventory and architecture details. Never commit secrets or expose the Supabase service-role key through a `VITE_` variable.

## Validation

```bash
npx --yes pnpm@10.34.4 check
npx --yes pnpm@10.34.4 test
npx --yes pnpm@10.34.4 build
npx --yes pnpm@10.34.4 audit --prod
```

Playwright tests are available with `pnpm test:e2e` after installing Chromium. `pnpm check` type-checks `api/` too (via `tsconfig.api.json`), and CI gates every PR on `pnpm check` + `pnpm test`; the Vercel preview build remains the final runtime check.

## Deployment

Vercel deploys the `main` branch to production. The build writes the storefront to `dist/public`; API handlers live under `api/`. Do not add another root serverless function without consolidating an existing route because the project is at the Vercel Hobby function limit.

Before promoting a release, verify the storefront, public APIs, checkout flow, migrations, sensitive RPC privileges, and runtime logs. Full operating guidance and known dashboard-only follow-ups live in `AGENTS.md`.

## Security notes

- Checkout amounts are recalculated on the server; client totals are never trusted.
- Payment webhooks fail closed when their secret is absent and verify the raw request body.
- Admin and affiliate access is bound to verified Supabase users.
- Sensitive `SECURITY DEFINER` RPCs must revoke execute permission from `public`, `anon`, and `authenticated`, then grant only `service_role`.
- Product artwork is served as WebP; keep original high-resolution source files outside the deployment repository.

All products are sold strictly for in-vitro laboratory research use and are not intended for human or veterinary use.
