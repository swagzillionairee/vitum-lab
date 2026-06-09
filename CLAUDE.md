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
  create-crypto-payment.ts   POST /api/create-crypto-payment (server-side discount/commission calc + "order received" email)
  nowpayments-webhook.ts     POST /api/nowpayments-webhook (raw body, HMAC-verified; confirmed/failed emails, promo use count)
  validate-discount.ts       POST /api/validate-discount (affiliate codes + promo_codes; pass subtotal for min-subtotal checks)
  contact.ts                 POST /api/contact
  me.ts                      GET  /api/me → {email, isAdmin, isAffiliate} (+ one-time welcome email via metadata flag)
  products.ts                GET  /api/products → product list (public)
  cron.ts                    GET/POST /api/cron — hourly maintenance (expire stale orders + email sweep), CRON_SECRET-protected
  admin/[...slug].ts         Catch-all for /api/admin/* (summary, inventory, orders GET + PATCH actions, products CRUD, upload,
                             affiliates GET/POST/PATCH, payouts POST/DELETE, promos CRUD)
                             Order actions (PATCH /api/admin/orders): cancel (restocks paid orders + email),
                             ship (tracking+carrier + email), deliver (+email), recheck (reconciles vs NowPayments + emails),
                             notes, resend_email {event}
  affiliate/[...slug].ts     Catch-all for /api/affiliate/* (stats, orders)
  account/[...slug].ts       Catch-all for /api/account/*: orders (order history + timeline fields),
                             profile GET/PUT (saved shipping address in auth user metadata, falls back to last order)
  _lib/
    supabase-admin.js  Service-role Supabase client
    email.ts           ALL transactional email: one Gmail transport + branded layout + send per event
                       (order_created/confirmed/shipped/delivered/cancelled/failed/admin_new_order/welcome),
                       idempotent via orders.emails_sent; deferEmail() = waitUntil with local fallback
    requireUser.ts     Validates Bearer JWT, returns {id, email}
    requireAdmin.ts    requireUser + checks admins table
    requireAffiliate.ts requireUser + checks affiliates table

server/
  index.ts          Express server (local dev only — proxies /api/* to the same handlers)
  lib/
    supabase-admin.ts  Service-role Supabase client (SUPABASE_SERVICE_ROLE_KEY)
    email.ts           Legacy local-dev copy (only used by server/index.ts — production email lives in api/_lib/email.ts)
```

**ESM import rule:** `package.json` has `"type": "module"`. All relative imports inside `api/` **must** include `.js` extension (e.g. `import { x } from "./_lib/supabase-admin.js"`). Missing extensions cause `ERR_MODULE_NOT_FOUND` at runtime on Vercel.

**Vercel function limit (Hobby plan):** 12 serverless functions max — currently 11 used (8 root files + 3 catch-alls). Admin, affiliate, and account routes are consolidated into catch-all handlers to stay under the limit. Do NOT add a new root file in `api/` without checking the count.

**Key data flow:**
1. Cart items live in `CartContext` (sessionStorage). `CartItem.cartCode` is the inventory key.
2. Checkout: CartDrawer shows cart items + a "Proceed to Checkout" button. Checkout **requires sign-in** — if not authenticated it routes to `/login?redirect=/checkout`. The dedicated `/checkout` page (`pages/Checkout.tsx`) has a 2/3 contact+shipping form (Google Places autocomplete, email prefilled from the account) and a 1/3 order summary (items, subtotal, discount, shipping, total, promo). Submitting → `POST /api/create-crypto-payment` (validates a complete address) → NowPayments invoice URL → redirect. The invoice page offers crypto **and** card/Apple Pay (fiat on-ramp), so there is a single checkout path. Card/Apple Pay must be enabled in the NowPayments dashboard (on-ramp via Guardarian/Banxa) — no code change needed to toggle it.
3. Payment confirmed: NowPayments IPN → `POST /api/nowpayments-webhook` → `decrement_stock()` RPC → order status `confirmed` → customer confirmation email + admin new-order alert (idempotent via `orders.emails_sent` — NowPayments fires both `confirmed` and `finished`). `failed`/`expired`/`refunded` IPNs on pending orders → status `failed` + email.
4. Order ID encodes email: `{10-char-alphanum}--{base64url(email)}` — no DB lookup needed to send the email.
5. Discounts are resolved **server-side** in `create-crypto-payment` from the code (affiliate → discount+commission; promo → discount only); client-sent amounts are ignored. Commission = `commission_percent` × net, stored on the order at creation.
6. **$0 orders skip NowPayments:** if the server-computed net is ≤ 0 (e.g. a 100%-off promo), `create-crypto-payment` inserts the order as `confirmed` immediately, decrements stock, counts the promo, sends the confirmed + admin-alert emails, and returns `{free:true, orderId}`. The client clears the cart and routes to `/order-success?...&free=1` (instant-confirm copy) — no NowPayments page, no IPN.

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
- `affiliates(id UUID PK, user_id → auth.users, code UNIQUE, discount_percent, commission_percent, name, email, created_at)`
- `affiliate_payouts(id UUID PK, affiliate_id → affiliates, amount NUMERIC > 0, note, created_at)` — payout tracking; **owed = Σ commission on paid orders − Σ payouts** (computed in `/api/admin/affiliates` and the summary).
- `promo_codes(id UUID PK, code UNIQUE, percent_off 1-100, min_subtotal, max_uses NULL=∞, used_count, expires_at, is_active, created_at)` — general promo codes, managed in Admin → Promos. `used_count` increments on payment confirmation via `increment_promo_use(p_code)`.
- `orders.emails_sent JSONB DEFAULT '{}'` — `{event: ISO timestamp}` per sent email; the idempotency log shown in the admin order detail (with Resend buttons).

Key RPCs:
- `decrement_stock(p_cart_code TEXT, p_qty INT) → INT` — atomic UPDATE WHERE stock >= qty, raises `P0001 insufficient_stock` on failure.
- `increment_stock(p_cart_code TEXT, p_qty INT) → INT` — restocks (used when an admin cancels a *paid* order).
- `increment_promo_use(p_code TEXT)` — atomic promo usage counter.

**Scheduled jobs (pg_cron):** `expire-stale-orders` runs hourly — sets `status='cancelled'` (reason `auto-expired…`) on `pending` orders older than 24h (pending orders never decremented stock, so no restock needed). `email-cron` runs hourly — pg_net POST to `/api/cron` (CRON_SECRET header), which also expires stale orders AND sends the cancellation emails (idempotent; the two jobs coexist safely — the endpoint's sweep emails anything the SQL job expired).

RLS: `inventory` is publicly readable (anon). `orders`, `affiliates`, `affiliate_payouts`, and `promo_codes` are service-role only.

---

## Environment Variables

```bash
# Server-side (set in Vercel dashboard; auto-injected by Vercel-Supabase connector)
# All of the below are CONFIGURED in Vercel as of June 2026.
SUPABASE_URL=https://mddgtvwcwsmlbwiafdvq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
GMAIL_USER=hello@vitumlab.com
GMAIL_APP_PASSWORD=
BASE_URL=https://vitum-lab.vercel.app
ORDERS_EMAIL=orders@vitumlab.com      # admin new-paid-order alerts (free Workspace alias on hello@); falls back to GMAIL_USER
INVENTORY_EMAIL=inventory@vitumlab.com # reserved for the Tier-3 low-stock digest; falls back to GMAIL_USER
CRON_SECRET=                           # shared secret for /api/cron (matches the pg_cron email-cron job header)

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

**Automated emails — BUILT (Tier 1 + Tier 2, June 2026).** All transactional email lives in `api/_lib/email.ts` (one Gmail transport, one branded layout, idempotent via `orders.emails_sent`). Live emails: welcome (first `/api/me`, deduped via auth-metadata `welcomed` flag), order received w/ invoice link (checkout, via waitUntil), payment confirmed + admin new-paid-order alert → `ORDERS_EMAIL` (webhook + admin Re-check, inside the idempotency guard — fixed the historical double-send bug), shipping confirmation w/ carrier tracking link (USPS default), delivered (links COA library), cancelled/expired w/ reason (admin cancel + `/api/cron`), payment failed (webhook `failed`/`expired`/`refunded` + Re-check). Admin → Orders expanded row shows the per-order email log with Send/Resend buttons (`resend_email` action). **Env configured in Vercel (June 2026):** `GMAIL_APP_PASSWORD`, `ORDERS_EMAIL=orders@vitumlab.com`, `INVENTORY_EMAIL=inventory@vitumlab.com`, `CRON_SECRET` are all set — so admin alerts route to orders@ and the hourly `email-cron` job (pg_cron + pg_net → `/api/cron`) is live and sending auto-expiry cancellation emails.

*Explicitly rejected (owner decision — do NOT build or re-suggest):* abandoned-payment reminder emails.

*Tier 3 (deferred — keep in mind, don't build yet):* low-stock digest to INVENTORY_EMAIL (threshold 5, via cron); affiliate commission notifications/monthly statements; post-delivery follow-up (marketing-ish — needs an opt-out line); back-in-stock waitlist (needs UI + table + cron); newsletters/promos (require a real ESP with list management + unsubscribe — never via Gmail SMTP).

**Affiliate payout tracking — built.** Admin → **Affiliates** tab: list w/ earned (commission on paid orders), paid (recorded payouts), owed (earned − paid), Record Payout / Edit % / Add Affiliate actions, expandable payout history (deletable entries). Overview "Commissions Owed" KPI + breakdown are payout-aware. Commission is computed server-side at order creation (was previously never written — fixed). First affiliate: `asiancreativegaming@gmail.com`, code `ACG10` (10% discount / 10% commission).

**General promo codes — built.** `promo_codes` table + Admin → **Promos** tab (create w/ % off, min subtotal, max uses, expiry; enable/disable; delete). `validate-discount` checks affiliates first, then promos; `create-crypto-payment` re-validates server-side and ignores client discount math; `used_count` increments on payment confirmation.

**Customer account upgrades — built.** `/account` shows an order status timeline (Placed → Paid → Shipped → Delivered, cancelled/failed branches, tracking link via the shared `OrderTimeline` component — also rendered in the admin order detail), one-click **Reorder** (re-adds items at current prices, skips unavailable), and a saved shipping address (auth user metadata via `/api/account/profile`, auto-saved at checkout, prefilled on the next checkout, falls back to the latest order's address).

**Shipping labels (USPS) — NOT built; awaiting owner decision.** Owner wants USPS-only label purchase. Plan when approved: EasyPost or Shippo behind a `buy_label` admin order action (no new function slot), storing label URL + auto-filling tracking + firing the shipped email; delivery auto-detection via tracking polling in `/api/cron` (avoids a 12th function for a tracking webhook). Needs an owner-created EasyPost/Shippo account + API key env var before any code.
