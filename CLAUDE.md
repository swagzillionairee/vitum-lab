# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research peptide e-commerce site selling GLP-3 (R) / Retatrutide, GHK-Cu, NAD+, and BAC Water. Checkout is via NowPayments — customers pay with crypto, or with card/Apple Pay through the NowPayments fiat on-ramp (auto-converted to crypto). Deployed on Vercel.

**Stack:** React 19 + TypeScript + Tailwind CSS v4 (oklch color space) + wouter routing + Vite. Express backend (`server/index.ts`) for local dev. Vercel serverless functions (`/api/*.ts`) in production. Supabase for inventory, orders, and affiliates.

---

## Commands

```bash
pnpm dev          # Start Vite dev server (port 3000) — API routes handled inline via vitePluginLocalApi
pnpm build        # vite build → dist/public, then esbuild server → dist/index.js
pnpm check        # TypeScript type-check (no emit)
pnpm format       # Prettier
```

No test suite is configured (vitest is installed but unused). There is no lint script — use `pnpm check` for type errors.

The Vite root is `client/` (not repo root). Path aliases: `@` → `client/src`, `@shared` → `shared/`, `@assets` → `attached_assets/`.

---

## Architecture

```
client/src/
  pages/            Page components (Shop, ProductDetail, Home, COALibrary, AdminDashboard, etc.)
  components/       Navbar, Footer, CartDrawer, LegalPage, ReconstitutionCalculator, etc.
  lib/
    products.ts     Single source of truth — all product/variant data and cartCodes
    supabase.ts     Browser Supabase client (anon key via VITE_SUPABASE_ANON_KEY)
    api.ts          authedFetch helper — attaches Supabase JWT as Bearer token
  contexts/         CartContext (sessionStorage), ThemeContext (dark mode), AuthContext (Supabase Auth)
  hooks/
    useInventory.ts Fetches /api/inventory, exposes isAvailable(cartCode)/stockLabel(cartCode)

api/                Vercel serverless functions — ALL relative imports MUST use .js extensions (ESM)
  inventory.ts                GET  /api/inventory → {cartCode: stock} map
  create-crypto-payment.ts   POST /api/create-crypto-payment
  nowpayments-webhook.ts     POST /api/nowpayments-webhook (raw body, HMAC-verified)
  validate-discount.ts       POST /api/validate-discount
  contact.ts                 POST /api/contact
  me.ts                      GET  /api/me → {email, isAdmin, isAffiliate}
  products.ts                GET  /api/products → product list (public)
  admin/[...slug].ts         Catch-all for /api/admin/* (inventory, orders GET + PATCH actions, products CRUD, upload)
                             Order actions (PATCH /api/admin/orders): cancel (restocks paid orders),
                             ship (tracking+carrier), deliver, recheck (reconciles vs NowPayments), notes
  affiliate/[...slug].ts     Catch-all for /api/affiliate/* (stats, orders)
  account/orders.ts          GET  /api/account/orders → orders for logged-in user by email
  _lib/
    supabase-admin.js  Service-role Supabase client
    requireUser.ts     Validates Bearer JWT, returns {id, email}
    requireAdmin.ts    requireUser + checks admins table
    requireAffiliate.ts requireUser + checks affiliates table

server/
  index.ts          Express server (local dev only — proxies /api/* to the same handlers)
  lib/
    supabase-admin.ts  Service-role Supabase client (SUPABASE_SERVICE_ROLE_KEY)
    email.ts           Nodemailer/Gmail helpers
```

**ESM import rule:** `package.json` has `"type": "module"`. All relative imports inside `api/` **must** include `.js` extension (e.g. `import { x } from "./_lib/supabase-admin.js"`). Missing extensions cause `ERR_MODULE_NOT_FOUND` at runtime on Vercel.

**Vercel function limit (Hobby plan):** 12 serverless functions max. Admin and affiliate routes are consolidated into two catch-all handlers (`api/admin/[...slug].ts`, `api/affiliate/[...slug].ts`) to stay under the limit.

**Key data flow:**
1. Cart items live in `CartContext` (sessionStorage). `CartItem.cartCode` is the inventory key.
2. Checkout: CartDrawer shows cart items + a "Proceed to Checkout" button. Checkout **requires sign-in** — if not authenticated it routes to `/login?redirect=/checkout`. The dedicated `/checkout` page (`pages/Checkout.tsx`) has a 2/3 contact+shipping form (Google Places autocomplete, email prefilled from the account) and a 1/3 order summary (items, subtotal, discount, shipping, total, promo). Submitting → `POST /api/create-crypto-payment` (validates a complete address) → NowPayments invoice URL → redirect. The invoice page offers crypto **and** card/Apple Pay (fiat on-ramp), so there is a single checkout path. Card/Apple Pay must be enabled in the NowPayments dashboard (on-ramp via Guardarian/Banxa) — no code change needed to toggle it.
3. Payment confirmed: NowPayments IPN → `POST /api/nowpayments-webhook` → `decrement_stock()` RPC → order status `confirmed` → confirmation email.
4. Order ID encodes email: `{10-char-alphanum}--{base64url(email)}` — no DB lookup needed to send the email.

---

## Product Variants (cartCode is the unique key)

| cartCode | Price | Notes |
|---|---|---|
| `retatrutide-10mg` | $129 | |
| `retatrutide-20mg` | $189 | |
| `retatrutide-30mg` | $249 | |
| `ghk-cu-50mg` | $69 | LOT: B031 |
| `ghk-cu-100mg` | $109 | LOT: B031 |
| `nad-500mg` | $129 | stock = 0 |
| `bac-water-10ml` | $12 | |

Free gift `bac-water-free` (price $0) auto-added when subtotal ≥ $150 — skip stock checks for it.

---

## Supabase Schema

**Project ID:** `mddgtvwcwsmlbwiafdvq` (us-west-2)

Tables in `public`:
- `inventory(cart_code PK, stock INT CHECK >= 0, is_active BOOL, updated_at)` — availability is **stock-driven**: `stock = 0` disables Add to Cart on Shop + ProductDetail. The `is_active` flag is retained in the schema but no longer used by the storefront or admin (the manual hide/show toggle was removed; `/api/inventory` returns all rows).
- `orders(id PK, email, items JSONB, shipping_address JSONB, gross_amount, discount_amount, net_amount, discount_code, affiliate_id, commission_amount, status CHECK IN pending/confirmed/finished/failed/cancelled, fulfillment_status CHECK IN unfulfilled/shipped/delivered, tracking_number, carrier, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, confirmed_at, created_at)` — `status` is the payment lifecycle, `fulfillment_status` is the shipping state (orthogonal). `shipping_address` = {name, line1, line2, city, state, postal_code, country, phone}.
- `affiliates(id UUID PK, user_id → auth.users, code UNIQUE, discount_percent, commission_percent, name, created_at)`

Key RPCs:
- `decrement_stock(p_cart_code TEXT, p_qty INT) → INT` — atomic UPDATE WHERE stock >= qty, raises `P0001 insufficient_stock` on failure.
- `increment_stock(p_cart_code TEXT, p_qty INT) → INT` — restocks (used when an admin cancels a *paid* order).

**Scheduled job (pg_cron):** `expire-stale-orders` runs hourly — sets `status='cancelled'` (reason `auto-expired…`) on `pending` orders older than 24h. Pending orders never decremented stock, so no restock needed.

RLS: `inventory` is publicly readable (anon). `orders` and `affiliates` are service-role only.

---

## Environment Variables

```bash
# Server-side (set in Vercel dashboard; auto-injected by Vercel-Supabase connector)
SUPABASE_URL=https://mddgtvwcwsmlbwiafdvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
GMAIL_USER=hello@vitumlab.com
GMAIL_APP_PASSWORD=
BASE_URL=https://vitum-lab.vercel.app

# Browser (Vite needs VITE_ prefix — must be set manually in Vercel)
VITE_SUPABASE_URL=https://mddgtvwcwsmlbwiafdvq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_GOOGLE_MAPS_API_KEY=   # optional — enables Places address autocomplete at checkout; falls back to native browser autofill if unset
```

The Vercel-Supabase connector auto-injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` but **not** the `VITE_` prefixed vars — those must be added manually for the browser bundle to have Supabase access.

---

## Styling Conventions

- Tailwind v4 with oklch color space throughout. No CSS variables for colors — values are inline oklch literals.
- Dark mode: `class` strategy via `ThemeContext`. Dark overrides live in `client/src/index.css` as `.dark` class selectors targeting specific oklch values.
- Dark section headers (`bg-[oklch(0.13_0.01_260)]`) intentionally stay dark in dark mode — don't add dark: overrides for them.
- Active/selected pills use `dark:bg-[oklch(0.40_0.16_260)]` cobalt blue.

---

## Deployment

- Vercel auto-deploys on push to `main`.
- Build output: `dist/public` (static) + `dist/index.js` (Express fallback, unused in prod).
- API routes: `/api/*.ts` → Vercel serverless functions (Node.js runtime).
- COA PDFs are static assets in `public/coa/`.

---

## Authentication (built — Supabase Auth)

Three login types share `AuthContext` (`client/src/contexts/AuthContext.tsx`) and the
`authedFetch` helper (`client/src/lib/api.ts`, attaches the Supabase JWT as a Bearer token).
Server routes validate the JWT via helpers in `server/lib/`:
- `requireUser.ts` — any logged-in user (returns id + email)
- `requireAdmin.ts` — checks `admins` table; links `user_id` on first login
- `requireAffiliate.ts` — checks `affiliates` table; links `user_id` on first login

| Login | Route | Methods | Redirect after auth | Gated by |
|---|---|---|---|---|
| Customer | `/login` → `/account` | Google + magic link | role-checked via `/api/me`: admin→`/admin`, affiliate→`/affiliate/dashboard`, else `/account` | — |
| Affiliate | `/affiliate/login` → `/affiliate/dashboard` | magic link only | `/affiliate/dashboard` | `affiliates` table |
| Admin | `/admin/login` → `/admin` | Google + magic link | `/admin` | `admins` table |

Key detail: the customer login is the single entry point — an admin can sign in there with
their normal credentials and gets routed to `/admin` automatically (via `/api/me`).

**Endpoints:** `api/me.ts` (role), `api/account/orders.ts` (customer orders by email),
`api/admin/[...slug].ts` (inventory GET/PATCH, orders GET, products CRUD, image upload),
`api/affiliate/[...slug].ts` (stats, orders).

Customer order history matches orders by **email** (not `user_id`), so orders placed before
the account existed still appear. `admins`/`affiliates` tables have `email` + nullable `user_id`.

**Routing:** `/admin/*` and `/affiliate/*` render standalone (no Navbar/Footer, no age gate).
`/login` and `/account` keep storefront chrome but skip the age gate. Navbar shows a User icon
linking to `/account` when signed in, else `/login`.

**Setup still required in Supabase dashboard:** enable Google provider (Auth → Providers) with a
Google Cloud OAuth client. Magic-link works without it. To add an affiliate, insert a row into
`affiliates` (email, code, discount_percent, commission_percent).

## Local Dev Setup

`pnpm dev` starts Vite only. The `vitePluginLocalApi` plugin (in `vite.config.ts`) intercepts `/api/*` requests and routes them to the Vercel handler files via `server.ssrLoadModule`. This means TypeScript handlers run through Vite's esbuild pipeline — no separate API server needed.

**Required env vars for local dev** (create `.env.local` at project root):
```
SUPABASE_URL=https://mddgtvwcwsmlbwiafdvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
VITE_SUPABASE_URL=https://mddgtvwcwsmlbwiafdvq.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
NOWPAYMENTS_API_KEY=<optional>
GMAIL_USER=hello@vitumlab.com
GMAIL_APP_PASSWORD=<optional>
```

Note: The old `server/index.ts` Express server handles `create-crypto-payment` and `nowpayments-webhook` for local testing, but those routes are also covered by `vitePluginLocalApi` via `api/create-crypto-payment.ts`.

---

## Known Gotchas

- **`vercel.json` SPA rewrite** uses a negative lookahead `/((?!api/).*)` so that `/api/*` requests reach serverless functions instead of falling through to `index.html`. Do not change this to `(.*)` or catch-all dynamic routes (e.g. `api/admin/[...slug].ts`) will break.
- **`api/` is excluded from `tsconfig.json`** — `pnpm check` does not type-check serverless functions. ESM extension errors will not surface locally; test against Vercel preview before merging.
- **`vitePluginLocalApi`** in `vite.config.ts` intercepts `/api/*` in local dev via `server.ssrLoadModule` — no separate API server needed for `pnpm dev`.

---

## Open Work

**Product management** — built and live. Products are stored in the Supabase `products` table and managed via the Admin → Products tab. Images are stored in the `product-images` Supabase Storage bucket.

**Admin dashboard summary (requested, not yet built)** — add a summary/overview to the Admin dashboard showing key metrics: total revenue (sum of `net_amount` for paid orders), pending order count, low-stock items (inventory at/below a threshold), and similar at-a-glance stats.
