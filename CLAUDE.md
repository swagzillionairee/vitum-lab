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
  admin/[...slug].ts         Catch-all for /api/admin/* (summary, inventory, orders GET + PATCH actions, products CRUD, upload)
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
- **All new changes must always be deployed to production immediately.** Every feature branch must be merged to `main` without asking for confirmation — always merge PRs to main.

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

**Admin dashboard summary** — built. Admin → **Overview** tab (default) shows revenue (30d + all-time), orders-to-fulfill (paid + unfulfilled), pending-payment count, low/out-of-stock list, orders-this-week, AOV, top sellers, and recent orders — plus a daily revenue bar chart with a 10/30/60/90-day toggle, affiliate commissions owed (total KPI + per-affiliate breakdown), repeat-customer rate, cancelled-orders-30d count, and color-coded KPI tiles via the reusable `<Kpi>` component (green = good, amber = warning, red = urgent, cobalt = info). Backed by `GET /api/admin/summary` (computed in the admin catch-all; pages through orders 1000 rows at a time because PostgREST caps a single response at 1000 rows). KPI tiles deep-link into the Orders tab with filters pre-applied.

**Automated emails — APPROVED PLAN (owner-approved June 2026), not built yet.** Build Tier 1 + Tier 2. Tier 3 is deferred. All sends via Gmail SMTP from `hello@vitumlab.com` (Google Workspace — 2,000 sends/day cap; SPF/DKIM handled by Google; add a DMARC record).

*Architecture decisions (agreed):*
- Consolidate into a single `api/_lib/email.ts`: one Nodemailer transport + one shared branded HTML layout (reuse the existing dark-header template) + one small `send<Event>()` per email type. The confirmation template/transport is currently duplicated in 3 places (`api/_lib/email.ts` — unused, inline in `api/nowpayments-webhook.ts`, `server/lib/email.ts`) — kill the copies. Keep the transport isolated so a later swap to a transactional ESP (Resend/Postmark) is a one-file change.
- Idempotency: migration adds `orders.emails_sent JSONB DEFAULT '{}'` (`{event: ISO timestamp}`); every send checks-then-stamps. This also fixes a known bug: NowPayments fires both `confirmed` and `finished` IPNs and the email send sits **outside** the `status === "pending"` guard in the webhook, so customers can currently receive the confirmation email twice.
- Never block or fail the main flow on email: wrap sends in try/catch; on latency-sensitive paths (checkout) send after the response using `waitUntil()` from `@vercel/functions`, with a plain `await` fallback for local dev.
- Function budget: 10 of 12 Vercel Hobby slots used. **No new endpoint per email** — trigger inline from existing handlers. Add ONE new `api/cron.ts` (slot 11; protected by a `CRON_SECRET` env var; invoked hourly by pg_cron + pg_net) for scheduled work, and fold the `expire-stale-orders` pg_cron SQL into it so order expiry and its email live in one place.
- Admin alert recipients are env-configurable: `ORDERS_EMAIL` (e.g. orders@vitumlab.com), `INVENTORY_EMAIL` (e.g. inventory@vitumlab.com), falling back to `GMAIL_USER`. These addresses are free Google Workspace **aliases** on the hello@ user (Admin console → Directory → Users → hello@ → Email aliases; up to 30, no extra cost), sorted in Gmail via filters/labels.

*Tier 1 (build):*
1. **Welcome** — on first authenticated `/api/me` call; dedupe via a `welcomed` flag in Supabase auth user metadata (service-role update); send non-blocking.
2. **Order received / awaiting payment** — in `api/create-crypto-payment.ts` after order insert + invoice creation; include items, total, the NowPayments invoice URL, and the 24h-expiry note; send via waitUntil.
3. **Payment confirmed** — exists in the webhook; move it inside the idempotency guard, ALSO send when admin Re-check confirms an order, and enrich with line items + shipping address.
4. **Shipping confirmation** — admin `ship` action in `api/admin/[...slug].ts`; include tracking number + carrier-aware tracking link (USPS/UPS/FedEx URL patterns).

*Tier 2 (build):*
5. **New-paid-order alert → ORDERS_EMAIL** — same webhook moment as #3 (and Re-check); items, amount, ship-to, link to admin Orders.
6. **Order cancelled/expired → customer** — admin `cancel` action + auto-expiry via `api/cron.ts`; include reason; nothing-was-charged note for pending orders.
7. **Delivered** — admin `deliver` action; closes the loop, links COA library.
8. **Payment failed** — webhook `failed`/`expired` statuses (currently ignored) + the Re-check-failed path; explain how to retry.

*Explicitly rejected (owner decision — do NOT build or re-suggest):* abandoned-payment reminder emails.

*Tier 3 (deferred — keep in mind, don't build yet):* low-stock digest to INVENTORY_EMAIL (threshold 5, via cron); affiliate commission notifications/monthly statements; post-delivery follow-up (marketing-ish — needs an opt-out line); back-in-stock waitlist (needs UI + table + cron); newsletters/promos (require a real ESP with list management + unsubscribe — never via Gmail SMTP).
