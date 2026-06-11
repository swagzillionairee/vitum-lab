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
pnpm test         # Vitest (run once) — unit (Node) + component (jsdom) tests
pnpm test:watch   # Vitest in watch mode
pnpm test:e2e     # Playwright e2e (checkout flow) — run `npx playwright install` first
pnpm format       # Prettier
```

Tests use **Vitest** (`vitest.config.ts` at repo root). Two environments via `environmentMatchGlobs`: pure logic + API tests are `*.test.ts` (Node, e.g. `api/_lib/pricing.test.ts`), component tests are `*.test.tsx` (jsdom + `@testing-library/react`, e.g. `client/src/contexts/CartContext.test.tsx`). `vitest.setup.ts` loads `@testing-library/jest-dom` only in the DOM env. Path aliases (`@`, `@shared`, `@assets`) are mirrored in the vitest config, and `esbuild.jsx: "automatic"` lets `.tsx` tests skip a React import. Coverage so far: order-money + promo logic in `pricing.ts` (incl. `sitewideSalePrice`, `promoAlreadyRedeemed`), the cart reducer (`CartContext`), and the sale/strikethrough mapper (`dbRowToProduct`). **Playwright** e2e lives in `e2e/` (`playwright.config.ts`); the checkout spec mocks every `/api/*` call and seeds the age-gate cookie + a fake Supabase session, so it needs no live backend (`pnpm exec playwright install chromium` to get the browser). There is no lint script — use `pnpm check` for type errors.

The Vite root is `client/` (not repo root). Path aliases: `@` → `client/src`, `@shared` → `shared/`, `@assets` → `attached_assets/`.

---

## Architecture

```
client/src/
  pages/            Page components (Shop, ProductDetail, Home, COALibrary, Checkout, Account, AdminDashboard, etc.)
    admin/          AdminDashboard split into focused files: types.ts, shared.tsx (money/date
                    formatters, status color maps, <Kpi>, <RevenueChart>, <Field>), ProductModal.tsx,
                    and self-contained ShippingTab/CustomersTab/PromosTab/AffiliatesTab. The parent
                    AdminDashboard.tsx keeps Overview/Products/Inventory/Orders + loadData + order state.
  components/       Navbar, Footer, CartDrawer, OrderTimeline, AddressAutocomplete, ReconstitutionCalculator, etc.
  lib/
    products.ts     Single source of truth — all product/variant data and cartCodes
    supabase.ts     Browser Supabase client (anon key via VITE_SUPABASE_ANON_KEY)
    api.ts          authedFetch helper — attaches Supabase JWT as Bearer token
    promo.ts        Capture/persist a shared ?code= / ?ref= discount code (affiliate share links)
  contexts/         CartContext (sessionStorage; free gift capped at qty 1), ThemeContext (dark mode), AuthContext (Supabase Auth)
  hooks/
    useInventory.ts Fetches /api/inventory, exposes isAvailable(cartCode)/stockLabel(cartCode)

api/                Vercel serverless functions — ALL relative imports MUST use .js extensions (ESM)
  inventory.ts                GET  /api/inventory → {cartCode: stock} map; POST → join back-in-stock waitlist (public, {cartCode, email})
  create-crypto-payment.ts   POST /api/create-crypto-payment (server-side discount/commission calc + "order received" email; enforces promo one-use-per-email)
  nowpayments-webhook.ts     POST /api/nowpayments-webhook (raw body, HMAC-verified; confirmed/failed emails, promo use count)
  validate-discount.ts       POST /api/validate-discount (affiliate codes + promo_codes; pass subtotal + email — rejects an already-used promo)
  contact.ts                 POST /api/contact
  me.ts                      GET  /api/me → {email, isAdmin, isAffiliate} (+ one-time welcome email via metadata flag)
  products.ts                GET  /api/products → product list (public); projects the active site-wide sale onto each variant's sale_price
  cron.ts                    GET/POST /api/cron — hourly maintenance (expire stale orders + email sweep + daily low-stock digest @14:00 UTC
                             + Shippo delivery polling → delivered emails + post-delivery follow-up @7d + affiliate monthly statements 1st@15:00 UTC), CRON_SECRET-protected
  admin/[...slug].ts         Catch-all for /api/admin/* (summary, inventory [PATCH 0→stock emails the back-in-stock waitlist], orders GET + PATCH actions, products CRUD, upload,
                             affiliates GET/POST/PATCH, payouts POST/DELETE, promos CRUD,
                             site-promo GET/PUT → the store-wide sale (enabling it clears all per-variant sale prices),
                             quantity-tiers GET/PUT → quantity discount tiers, rewards GET/PUT → loyalty % + referral amounts,
                             order-pdfs POST {ids,type} → combined 4×6 label PDF or packing slips (bulk, via pdf-lib),
                             waitlist GET → pending back-in-stock counts per cart_code,
                             users GET → Supabase Auth list + per-customer order count/lifetime spend for the Customers tab,
                             shipments GET → orders with a tracking number for the Shipping tab (bulk-copy for USPS))
                             Order actions (PATCH /api/admin/orders): cancel (restocks paid orders + email),
                             ship (tracking+carrier + email), deliver (+email), recheck (reconciles vs NowPayments + emails),
                             notes, resend_email {event}; DELETE /api/admin/orders {id | ids[]} → permanent hard delete (no restock; single + bulk)
  affiliate/[...slug].ts     Catch-all for /api/affiliate/* (stats, orders)
  account/[...slug].ts       Catch-all for /api/account/*: orders (order history + timeline fields),
                             profile GET/PUT (saved shipping address in auth user metadata, falls back to last order),
                             credit GET (store-credit balance + ledger), referral GET (the customer's referral code + share link)
  public/[...slug].ts        Catch-all for /api/public/* (no auth): site GET → site-wide sale config (countdown banner) + quantity_tiers,
                             track GET ?order=&email= → order status/timeline (email must match the order)
  _lib/
    supabase-admin.js  Service-role Supabase client
    email.ts           ALL transactional email: one Gmail transport + branded layout + send per event
                       (order_created/confirmed/shipped/delivered/cancelled/failed/admin_new_order/admin_delivered/followup/welcome
                       + sendAffiliateCommission/sendAffiliateStatement/sendBackInStock/sendLowStockDigest),
                       item rows include a 40px product thumbnail (resolved from products.variants by cartCode),
                       idempotent via orders.emails_sent; deferEmail() = waitUntil with local fallback
    shippo.ts          USPS labels (buyLabel — Priority Mail Flat Rate Padded Envelope, 4×6 PDF) + getTrackingStatus + validateAddress (checkout address check); token = test/live
    pricing.ts         Pure order math + promo validation (gross/discount/net/commission, isFreeOrder, applyCredit, isPromoUsable,
                       sitewideSalePrice, isSitewideActive, promoAlreadyRedeemed [one-use-per-email],
                       quantityDiscountPercent + computeStackedDiscounts [quantity tier → code, with breakdown lines]) — unit-tested
    credit.ts          Store credit ledger + loyalty + referrals: getBalance (RPC, redemptions on dead orders excluded),
                       addLedger (idempotent per order+reason), reserveCredit, earnLoyalty, grantReferralReward, getOrCreateReferralCode, getRewardConfig
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

**Vercel function limit (Hobby plan):** 12 serverless functions max — **currently 12 used (8 root files + 4 catch-alls)** — AT THE LIMIT. Admin, affiliate, account, and the new **public** routes are consolidated into catch-all handlers. `api/public/[...slug].ts` (`/api/public/site` = site-wide sale banner config; `/api/public/track` = public order tracking) is the 12th. **Do NOT add another serverless function** — fold any new endpoint into an existing catch-all (public/no-auth reads go in `api/public/`).

**Key data flow:**
1. Cart items live in `CartContext` (sessionStorage). `CartItem.cartCode` is the inventory key.
2. Checkout: CartDrawer shows cart items + a "Proceed to Checkout" button. Checkout **requires sign-in** — if not authenticated it routes to `/login?redirect=/checkout`. The dedicated `/checkout` page (`pages/Checkout.tsx`) has a 2/3 contact+shipping form (Google Places autocomplete, email prefilled from the account) and a 1/3 order summary (items, subtotal, discount, shipping, total, promo). Submitting → `POST /api/create-crypto-payment` (validates a complete address) → NowPayments invoice URL → redirect. The invoice page offers crypto **and** card/Apple Pay (fiat on-ramp), so there is a single checkout path. Card/Apple Pay must be enabled in the NowPayments dashboard (on-ramp via Guardarian/Banxa) — no code change needed to toggle it. **⚠️ As of June 2026 the card/Apple Pay on-ramp is pending NowPayments review and not yet live; the storefront copy that mentions it is intentionally left as-is (owner decision).**
3. Payment confirmed: NowPayments IPN → `POST /api/nowpayments-webhook` → `decrement_stock()` RPC → order status `confirmed` → customer confirmation email + admin new-order alert (idempotent via `orders.emails_sent` — NowPayments fires both `confirmed` and `finished`). `failed`/`expired`/`refunded` IPNs on pending orders → status `failed` + email.
4. Order ID encodes email: `{10-char-alphanum}--{base64url(email)}` — no DB lookup needed to send the email.
5. Discounts are resolved **server-side** in `create-crypto-payment` from the code (affiliate → discount+commission; promo → discount only); client-sent amounts are ignored. Commission = `commission_percent` × net, stored on the order at creation.
6. **Discounts stack** server-side in `create-crypto-payment` (`computeStackedDiscounts`): the site-wide sale is baked into item prices, then the quantity tier %, then a single code (promo/affiliate % or referral flat $). **Store credit** then applies as tender on top, reducing the cash `amountDue` (`applyCredit`); it's reserved in the ledger at order creation. Each discount line is recorded in `orders.discount_breakdown` and shown at checkout.
7. **$0 due skips NowPayments:** if the server-computed `amountDue` is ≤ 0 (100%-off promo and/or store credit covering the order), `create-crypto-payment` inserts the order as `confirmed` immediately, decrements stock, counts the promo, earns loyalty + grants the referral reward, sends the confirmed + admin-alert emails, and returns `{free:true, orderId}`. The client clears the cart and routes to `/order-success?...&free=1` — no NowPayments page, no IPN.

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
| `bac-water-10ml` | $15 | |

Free gift `bac-water-free` (price $0) auto-added when subtotal ≥ $150 — **capped at quantity 1 per order** (CartContext pins it; CartDrawer shows a "Free gift · limit 1" badge instead of a stepper). Skip stock checks for it.

---

## Supabase Schema

**Project ID:** `mddgtvwcwsmlbwiafdvq` (us-west-2)

Tables in `public`:
- `inventory(cart_code PK, stock INT CHECK >= 0, is_active BOOL, updated_at)` — availability is **stock-driven**: `stock = 0` disables Add to Cart on Shop + ProductDetail. The `is_active` flag is retained in the schema but no longer used by the storefront or admin (the manual hide/show toggle was removed; `/api/inventory` returns all rows).
- `orders(id PK, email, items JSONB, shipping_address JSONB, gross_amount, discount_amount, net_amount, discount_code, discount_breakdown JSONB, credit_applied, referral_code, affiliate_id, commission_amount, status CHECK IN pending/confirmed/finished/failed/cancelled, fulfillment_status CHECK IN unfulfilled/shipped/delivered, tracking_number, carrier, label_url, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, confirmed_at, created_at)` — `status` is the payment lifecycle, `fulfillment_status` is the shipping state (orthogonal). `shipping_address` = {name, line1, line2, city, state, postal_code, country, phone}.
- `affiliates(id UUID PK, user_id → auth.users, code UNIQUE, discount_percent, commission_percent, name, email, created_at)`
- `affiliate_payouts(id UUID PK, affiliate_id → affiliates, amount NUMERIC > 0, note, created_at)` — payout tracking; **owed = Σ commission on paid orders − Σ payouts** (computed in `/api/admin/affiliates` and the summary).
- `promo_codes(id UUID PK, code UNIQUE, percent_off 1-100, min_subtotal, max_uses NULL=∞, used_count, starts_at, expires_at, is_active, created_at)` — general promo codes, managed in Admin → Promos. **One use per customer** (enforced by `promoAlreadyRedeemed` — checks prior paid orders with that code + email; affiliate codes are unlimited). Scheduling via `starts_at`/`expires_at` (honored by `isPromoUsable`). `used_count` increments on payment confirmation via `increment_promo_use(p_code)`; `max_uses` is an *additional* global cap.
- `store_settings(id BOOL PK =true singleton, sitewide_active BOOL, sitewide_percent 1-99, sitewide_label, sitewide_starts_at, sitewide_ends_at, quantity_tiers JSONB [{min_qty,percent}], loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal, updated_at)` — the optional **site-wide sale** (with scheduling) + **quantity discount tiers** + **loyalty/referral reward config**. `isSitewideActive` gates the sale; `/api/products` projects the % onto every variant's sale_price → strikethrough storefront-wide; `/api/public/site` feeds the countdown banner + tiers. Managed via `PUT /api/admin/site-promo`, `PUT /api/admin/quantity-tiers`, `PUT /api/admin/rewards`. Service-role only.
- `store_credit_ledger(id UUID PK, email, amount NUMERIC [+ earned / − redeemed], reason 'loyalty'|'referral'|'redemption'|'manual', order_id, created_at)` — store-credit wallet. **Balance is derived** via the `store_credit_balance(email)` RPC, which excludes redemptions tied to cancelled/failed orders (so a dead order's reserved credit is auto-refunded — no explicit writes). Idempotent via a unique (order_id, reason) index. Service-role only.
- `referral_codes(code PK, email UNIQUE, created_at)` — one referral code per customer (lazily created by `GET /api/account/referral`). Service-role only.
- `stock_waitlist(id UUID PK, cart_code, email, created_at, notified_at, UNIQUE(cart_code,email))` — back-in-stock signups. `POST /api/inventory` upserts (notified_at=null); an admin inventory PATCH that takes stock 0→>0 emails all pending rows then stamps `notified_at`. Service-role only.
- `orders.emails_sent JSONB DEFAULT '{}'` — `{event: ISO timestamp}` per sent email; the idempotency log shown in the admin order detail (with Resend buttons).

Key RPCs:
- `decrement_stock(p_cart_code TEXT, p_qty INT) → INT` — atomic UPDATE WHERE stock >= qty, raises `P0001 insufficient_stock` on failure.
- `increment_stock(p_cart_code TEXT, p_qty INT) → INT` — restocks (used when an admin cancels a *paid* order).
- `increment_promo_use(p_code TEXT)` — atomic promo usage counter.
- `store_credit_balance(p_email TEXT) → NUMERIC` — derived store-credit balance (excludes redemptions on cancelled/failed orders).

**Scheduled jobs (pg_cron):** `expire-stale-orders` runs hourly — sets `status='cancelled'` (reason `auto-expired…`) on `pending` orders older than 24h (pending orders never decremented stock, so no restock needed). `email-cron` runs hourly — pg_net POST to `/api/cron` (CRON_SECRET header), which also expires stale orders AND sends the cancellation emails (idempotent; the two jobs coexist safely — the endpoint's sweep emails anything the SQL job expired).

RLS: `inventory` is publicly readable (anon). `orders`, `affiliates`, `affiliate_payouts`, `promo_codes`, `store_settings`, `store_credit_ledger`, and `referral_codes` are service-role only.

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
BASE_URL=https://vitumlab.com         # canonical site URL (emails, order links, NowPayments callbacks) — set this in Vercel; code default is also vitumlab.com
ORDERS_EMAIL=orders@vitumlab.com      # admin new-paid-order alerts (free Workspace alias on hello@); falls back to GMAIL_USER
INVENTORY_EMAIL=inventory@vitumlab.com # reserved for the Tier-3 low-stock digest; falls back to GMAIL_USER
DELIVERED_EMAIL=delivered@vitumlab.com # admin delivered alerts (alias on hello@); falls back to ORDERS_EMAIL → GMAIL_USER
CRON_SECRET=                           # shared secret for /api/cron (matches the pg_cron email-cron job header)

# Shipping (Shippo — USPS labels + auto-delivery). CONFIGURED in Vercel (SHIPPO_API_KEY + all SHIP_FROM_* set);
# SHIPPO_API_KEY is still a TEST key, so "Buy label" returns watermarked SAMPLE labels (test labels confirmed working).
SHIPPO_API_KEY=                        # ShippoToken; test vs live is key-determined (no code change to switch) — swap to live to ship real postage
SHIP_FROM_NAME=Vitum Lab               # return address — REQUIRED before "Buy label" works
SHIP_FROM_STREET1=                     # REQUIRED
SHIP_FROM_STREET2=                     # optional
SHIP_FROM_CITY=                        # REQUIRED
SHIP_FROM_STATE=                       # REQUIRED (2-letter)
SHIP_FROM_ZIP=                         # REQUIRED
SHIP_FROM_PHONE=                       # REQUIRED — USPS mandates a sender phone (any reachable number)
SHIP_FROM_EMAIL=                       # optional — sender email; auto-falls back to GMAIL_USER
SHIP_FROM_COUNTRY=US                   # defaults to US

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

**Automated emails — BUILT (Tier 1 + Tier 2, June 2026).** All transactional email lives in `api/_lib/email.ts` (one Gmail transport, one branded layout, idempotent via `orders.emails_sent`). Live emails: welcome (first `/api/me`, deduped via auth-metadata `welcomed` flag), order received w/ invoice link (checkout, via waitUntil), payment confirmed + admin new-paid-order alert → `ORDERS_EMAIL` (webhook + admin Re-check, inside the idempotency guard — fixed the historical double-send bug), shipping confirmation w/ carrier tracking link (USPS default), delivered (customer, links COA library) + admin delivered alert → `DELIVERED_EMAIL` (both fire on the admin `deliver` action), cancelled/expired w/ reason (admin cancel + `/api/cron`), payment failed (webhook `failed`/`expired`/`refunded` + Re-check). Every item row in these emails shows a 40px product thumbnail. Admin → Orders expanded row shows the per-order email log with Send/Resend buttons (`resend_email` action). **Env configured in Vercel (June 2026):** `GMAIL_APP_PASSWORD`, `ORDERS_EMAIL=orders@vitumlab.com`, `INVENTORY_EMAIL=inventory@vitumlab.com`, `CRON_SECRET` are all set — so admin alerts route to orders@ and the hourly `email-cron` job (pg_cron + pg_net → `/api/cron`) is live and sending auto-expiry cancellation emails.

*Explicitly rejected (owner decision — do NOT build or re-suggest):* abandoned-payment reminder emails.

*Tier 3 — BUILT (June 2026):* **affiliate commission notification** (per-paid-order email to the attributed affiliate, idempotent via `emails_sent.affiliate_commission`, fired in the webhook + admin Re-check); **affiliate monthly statement** (`/api/cron` on the 1st @15:00 UTC — prior-month orders/commission + lifetime owed, via `sendAffiliateStatement`); **post-delivery follow-up** (`/api/cron`, 7 days after delivery, once via `emails_sent.followup`, includes an opt-out line). *Still deferred:* newsletters/promos (require a real ESP with list management + unsubscribe — never via Gmail SMTP).

**Back-in-stock waitlist — built.** Out-of-stock variants on ProductDetail show a "Notify me" email capture → `POST /api/inventory` (upserts `stock_waitlist`). When an admin sets a cart_code's stock from 0 → >0, the inventory PATCH emails everyone pending (`sendBackInStock`, deferred) and stamps `notified_at`. Admin → Inventory shows a "🔔 N waiting" badge per cart_code (from `GET /api/admin/waitlist`).

**Low-stock digest — built.** `/api/cron` sends a digest of items ≤5 units to `INVENTORY_EMAIL` once a day (only when it runs at 14:00 UTC ≈ 9–10am ET), via `sendLowStockDigest`.

**Promo/affiliate share links — built.** A shared URL like `vitumlab.com/shop?code=ACG10` (`?code` / `?ref` / `?promo`) is captured on landing by `capturePromoFromUrl()` (App mount → localStorage `vitum_promo`, param stripped); Checkout auto-applies it on mount (resolves the discount + affiliate attribution) and clears it once an order is placed. The affiliate dashboard shows a copy-able "Your share link" card so affiliates share one link instead of dictating a code.

**Affiliate payout tracking — built.** Admin → **Affiliates** tab: list w/ earned (commission on paid orders), paid (recorded payouts), owed (earned − paid), Record Payout / Edit % / Add Affiliate actions, expandable payout history (deletable entries). Overview "Commissions Owed" KPI + breakdown are payout-aware. Commission is computed server-side at order creation (was previously never written — fixed). First affiliate: `asiancreativegaming@gmail.com`, code `ACG10` (10% discount / 10% commission).

**General promo codes — built.** `promo_codes` table + Admin → **Promos** tab (create w/ % off, min subtotal, max uses, expiry; enable/disable; delete). `validate-discount` checks affiliates first, then promos; `create-crypto-payment` re-validates server-side and ignores client discount math; `used_count` increments on payment confirmation. **One use per customer** (per email) is enforced server-side in both `validate-discount` (early UI feedback) and `create-crypto-payment` (authoritative) via `promoAlreadyRedeemed`; affiliate codes stay unlimited. Only one code applies per order (affiliate **or** promo, never both).

**Site-wide sale — built.** `store_settings` singleton + the **Site-wide Sale** card at the top of Admin → **Promos** (set % off 1–99, optional label + end date; Start/Update/Turn off). `/api/products` projects the active sale onto every variant's `sale_price`, so the storefront shows the original price struck through with the new price (and adds the discounted price to the cart) with **no frontend changes** — it reuses the existing per-variant sale rendering. Enabling a site-wide sale **clears all individual product sale prices** (it always takes precedence). Promo/affiliate codes still stack on top at checkout (the code % comes off the already-discounted subtotal).

**Order management (admin) — built.** Admin → **Orders** now has a per-row **Delete** (permanent hard delete, double-confirm, no restock — distinct from Cancel which restocks) plus **bulk select** (checkbox per row + select/deselect-all header) with a **Delete selected** bulk action (also double-confirm). Backed by `DELETE /api/admin/orders {id | ids[]}`.

**Public order tracking — built.** `/track` page (linked in the Navbar next to Contact) — customer enters order number + email → `GET /api/public/track` (email must match the order) → reuses `OrderTimeline`. No sign-in required.

**Site-wide sale countdown + scheduling — built.** The Site-wide Sale card (Admin → Promos) takes optional **start + end** dates (scheduling); `SaleBanner` (storefront-wide, above the Navbar) reads `GET /api/public/site` and shows a live countdown to the end date while the sale is active. Promo **codes** also support a `starts_at` schedule.

**Tiered quantity discounts — built.** Admin → Promos → **Quantity Discounts** card (tiers of min-qty → % off; "Use recommended" seeds 3→5%, 5→10%, 10→15%). Applied server-side in `create-crypto-payment` via `computeStackedDiscounts`: the best matching tier's % comes off first, then the promo/affiliate % off the remainder — so it **stacks** with the site-wide sale (baked into item prices) and the code. Each discount is shown as its own line at checkout and recorded in `orders.discount_breakdown` (also rendered in the admin order detail).

**Loyalty / store credit + customer referrals — built.** Store-credit wallet (`store_credit_ledger`, balance derived via `store_credit_balance` RPC — redemptions on cancelled/failed orders are auto-excluded, so reserved credit frees itself with no refund writes). **Loyalty:** each paid order earns a configurable % back (default 5%) on the cash actually paid — granted on confirmation (webhook + admin Re-check + free-order path), idempotent. **Referrals:** every customer has a referral link (`/?ref=CODE`, shown on `/account`); a NEW referee gets a flat $ off their first order (auto-applied via the existing `?ref` capture), and the referrer earns store credit once the referee's first order is paid (self-referral + first-order guards). **Spending:** store credit auto-applies at checkout as tender — it reduces the cash amount due (reserved at order creation; a fully-covered order uses the $0 path). Balance + referral link on `/account`; amounts/rate configured in Admin → Promos → **Loyalty & Referrals** (`/api/admin/rewards`). `api/_lib/credit.ts` centralizes the logic; `applyCredit` is pure + unit-tested.

**Testing — in progress.** Vitest unit (Node) + component (jsdom) tests, plus a Playwright checkout e2e — see the Commands section. Next candidates: more page/component coverage and CI to run `pnpm test` on PRs.

**Customer account upgrades — built.** `/account` shows an order status timeline (Placed → Paid → Shipped → Delivered, cancelled/failed branches, tracking link via the shared `OrderTimeline` component — also rendered in the admin order detail), one-click **Reorder** (re-adds items at current prices, skips unavailable), and a saved shipping address (auth user metadata via `/api/account/profile`, auto-saved at checkout, prefilled on the next checkout, falls back to the latest order's address).

**Shipping labels + auto-delivery (USPS via Shippo) — BUILT & WORKING in test mode (June 2026).** `api/_lib/shippo.ts` wraps Shippo; the token decides test vs live (no code change to switch). Admin → Orders has a **Buy label** button (paid + unfulfilled) → `buy_label` order action → buys a **USPS Priority Mail Flat Rate Padded Envelope** label, stores `orders.label_url` + tracking + carrier, sets `shipped`, fires the shipped email, and opens the label PDF; a **Manual** button still allows typing tracking by hand, and a **Label** link reopens the PDF. **Auto-delivery:** `/api/cron` polls Shippo tracking for shipped orders (`getTrackingStatus`); when a number reads `DELIVERED` it marks the order delivered and fires the customer `delivered` + `admin_delivered` (→ `delivered@`) emails — no manual clicking. **All `SHIP_FROM_*` env vars (return address incl. the USPS-required `SHIP_FROM_PHONE`) are configured in Vercel, and test labels are confirmed generating** (sender email auto-fills from `GMAIL_USER`). `SHIPPO_API_KEY` is still a TEST key, so Buy label returns watermarked SAMPLE labels + test tracking — **swap to the live token (no code change) to ship real postage.** Labels print as a **4×6 PDF** (`label_file_type: "PDF_4x6"`). Lives in the admin catch-all + cron + `_lib`.

---

## Recently shipped (June 2026)

**Shippo 4×6 labels — built.** `buyLabel` requests `label_file_type: "PDF_4x6"` so labels print on a 4×6 thermal label printer (Shippo also supports `ZPLII` if a Zebra is ever used).

**Bulk order actions (Admin → Orders) — built.** The bulk-select bar (when ≥1 order is selected) has **Re-check / Buy labels / Mark delivered / Cancel** — each loops the selected IDs through the existing per-order PATCH actions with a success/fail summary — plus two combined PDFs: **Label PDF** (merges the selected orders' 4×6 `label_url` PDFs into one print job via `pdf-lib`; skips + reports unlabeled orders) and **Packing slips** (clean black-on-white **4×6** page per order — logo + "Vitum Lab" header, order/date/tracking, ship-to, items, total, "FOR RESEARCH USE ONLY / vitumlab.com" footer; thermal-printer friendly, no heavy fills). Backed by `POST /api/admin/order-pdfs {ids, type:"labels"|"slips"}` (admin catch-all; returns a base64 PDF the client opens as a Blob). The slip logo is bundled as base64 in `api/_lib/vt-logo.ts` (also in `client/public/vt-logo.png`). New dependency: **`pdf-lib`**.

**Product-page quantity discounts — built.** ProductDetail shows a quantity stepper + bulk-savings shortcut buttons ("Buy 3 · save 5%") from the configured quantity tiers (`/api/public/site`); Add-to-Cart adds the chosen quantity. Only the **active** tier (highest `min_qty` ≤ quantity) highlights, and the red price **previews the per-bottle price after the tier %** (original struck through). The cart adds the pre-tier unit price; the tier discount still applies cart-wide at checkout (server-authoritative).

**Researcher / 21+ attestation — built.** A required acknowledgment checkbox at checkout gates the place-order button and is re-validated server-side in `create-crypto-payment` (`attestation` must be true).

**Shippo address validation — built.** `validateAddress()` (`api/_lib/shippo.ts`) runs in `create-crypto-payment` at order creation and rejects undeliverable addresses; **fails open** on any Shippo error/outage so it never blocks sales spuriously.

**SEO — built.** The `SEO` component emits keywords, OG image/url, Twitter card, and JSON-LD; **Product** schema on product pages + **Organization/WebSite** on home. `client/public/sitemap.xml` covers product + content pages (incl. /research, /dose-calculator, /track); `robots.txt` disallows private routes.
