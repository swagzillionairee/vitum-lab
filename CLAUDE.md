# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research-peptide e-commerce site (Retatrutide/GLP-3 (R), GHK-Cu, NAD+, BAC Water). **Payments: three methods, one checkout — Square (live card processing) + manual peer-to-peer transfers (Zelle · Cash App · Venmo · bank ACH, admin-verified) + NowPayments crypto.** (TagadaPay was a former card processor; all of its code has been removed.) Deployed on Vercel; Supabase for inventory/orders/affiliates.

**Stack:** React 19 + TypeScript + Tailwind CSS v4 (oklch color space) + wouter routing + Vite. Local dev serves `/api/*` via `vitePluginLocalApi` in `vite.config.ts`; production uses Vercel serverless functions (`/api/*.ts`).

---

## Commands

```bash
pnpm dev          # Vite dev server (port 3000) — API routes handled inline via vitePluginLocalApi
pnpm build        # vite build → dist/public, then esbuild server → dist/index.js
pnpm check        # TypeScript type-check (no emit)
pnpm test         # Vitest (run once) — unit (Node) + component (jsdom)
pnpm test:watch   # Vitest watch mode
pnpm test:e2e     # Playwright e2e (checkout) — run `pnpm exec playwright install chromium` first
pnpm format       # Prettier
```

Tests use **Vitest** (`vitest.config.ts`). Two envs via `environmentMatchGlobs`: `*.test.ts` = Node (e.g. `api/_lib/pricing.test.ts`), `*.test.tsx` = jsdom + `@testing-library/react`. `esbuild.jsx: "automatic"` lets `.tsx` tests skip a React import. Coverage: `pricing.ts` order-money/promo logic, `CartContext` reducer, `useProducts` sale mapper, `orderLifecycle.ts`. **Playwright** e2e in `e2e/` mocks every `/api/*` call + seeds the age-gate cookie + a fake Supabase session (no live backend). No lint script — use `pnpm check`.

The Vite root is `client/` (not repo root). Path alias `@` → `client/src`.

---

## Architecture

```
client/src/
  pages/            Shop, ProductDetail, Home, COALibrary, Checkout, Account, AdminDashboard, OrderSuccess, OrderCancel, …
    admin/          AdminDashboard split: types.ts, shared.tsx (formatters, <Kpi>, <RevenueChart>, <Field>),
                    ProductModal.tsx, and self-contained ShippingTab/CustomersTab/PromosTab/AffiliatesTab.
                    Parent AdminDashboard.tsx keeps Overview/Products/Inventory/Orders + loadData + order state.
  components/       Navbar, Footer, CartDrawer, OrderTimeline, AddressAutocomplete, SEO,
                    SquareCardBox.tsx (in-browser Square card tokenization → single-use source_id),
                    ManualPaymentModal.tsx (Zelle/Cash App/Venmo/ACH "send your payment" modal), …
  lib/
    products.ts     Static fallback catalog — authoritative data is Supabase `products` via /api/products (useProducts)
    supabase.ts     Browser Supabase client (anon key)
    api.ts          authedFetch — attaches Supabase JWT as Bearer token
    promo.ts        Capture/persist a shared ?code=/?ref=/?promo= code (strips only those params; preserves others)
    orders.ts       formatOrderId
    discounts.ts    quantityDiscountPercent/round2/shippingFee — client mirror of the checkout math
  contexts/         CartContext (sessionStorage; free gift capped at qty 1; reconcileCartPrices re-syncs to live catalog),
                    ThemeContext (dark mode), AuthContext (Supabase Auth)
  hooks/
    useInventory.ts /api/inventory → isAvailable/stockLabel/stockDisplay (capped "50+")
    useProducts.ts  /api/products (dbRowToProduct → Product, sale strikethrough); falls back to lib/products.ts

api/                Vercel serverless functions — ALL relative imports MUST use .js extensions (ESM)
  inventory.ts                GET → {cartCode: stock}; POST → join back-in-stock waitlist (public)
  create-crypto-payment.ts    POST (REQUIRES auth) — the ONE checkout charge endpoint (legacy filename). Order email =
                              JWT email (never the body). Server-authoritative re-pricing + stacked discounts + store
                              credit; enforces promo one-use. Routes by `paymentMethod`: $0 due → confirm immediately;
                              `squareToken` (method "square") → chargeSquare (live card, sync); a manual method
                              (zelle/cashapp/venmo/ach) → pending "awaiting transfer" order (admin confirms); else →
                              NowPayments crypto invoice.
  nowpayments-webhook.ts      POST (raw body, HMAC-verified) — confirmed/failed emails, promo use count
  validate-discount.ts        POST (REQUIRES auth) — early UI validation of affiliate/promo codes
  contact.ts                  POST (rate-limited 5/10min/IP)
  me.ts                       GET → {email, isAdmin, isAffiliate} (+ one-time welcome email)
  products.ts                 GET → product list (public); projects the active site-wide sale onto sale_price
  cron.ts                     GET/POST — hourly: expire stale orders + email sweep + low-stock digest @14:00 UTC
                              + Shippo delivery polling → delivered/follow-up emails + affiliate statements (1st @15:00). CRON_SECRET.
  admin/[...slug].ts          Catch-all /api/admin/*: summary, inventory (PATCH 0→stock emails waitlist), orders GET +
                              PATCH actions, products CRUD, upload, affiliates, payouts, promos, site-promo,
                              quantity-tiers, rewards, payment-config GET/PUT (Admin → Payments: toggle methods + edit
                              Zelle/Cash App/Venmo/ACH handles; reports square_configured), order-pdfs (4×6 labels/slips
                              via pdf-lib), waitlist, users, shipments.
                              Order PATCH actions: cancel (restocks paid + email), ship, deliver, mark_paid (manual transfer
                              landed → confirm + fulfil via confirmPaidOrder), recheck (reconciles a pending order vs
                              NowPayments), notes, resend_email. DELETE → hard delete
                              (no restock; single + bulk).
  affiliate/[...slug].ts      Catch-all /api/affiliate/* (stats, orders)
  account/[...slug].ts        Catch-all /api/account/*: orders, profile GET/PUT (saved shipping address), credit, referral,
                              payment-sent POST (customer tapped "I've Sent the Payment" on their OWN pending manual order
                              → alerts the payment inbox; idempotent)
  public/[...slug].ts         Catch-all /api/public/* (no auth): site GET (sale banner + quantity_tiers + `payments` offer
                              via buildPayments — enabled Square/manual/crypto methods + manual handles/instructions),
                              track GET ?order=&email=
  _lib/
    supabase-admin.ts  Service-role Supabase client
    orderId.ts         buildOrderId — 3 letters + dash + 6 digits (e.g. "KFD-837291", nanoid); formatOrderId (legacy IDs)
    vt-logo.ts         Base64 logo for packing-slip PDFs
    email.ts           ALL transactional email (one Gmail transport + branded layout, idempotent via orders.emails_sent);
                       40px product thumbnails; deferEmail() = waitUntil with local fallback. Inbox resolvers fall back to
                       REAL mailboxes: ordersInbox = ORDERS_EMAIL||GMAIL_USER; paymentInbox = PAYMENT_EMAIL||ORDERS_EMAIL||
                       GMAIL_USER (the admin_payment_claimed manual-transfer alert). Manual-method emails inject the send-to
                       handle from store_settings.payment_config.
    shippo.ts          USPS labels (buyLabel, 4×6 PDF) + getTrackingStatus + validateAddress; token decides test/live
    pricing.ts         Pure order math + promo validation (gross/discount/net/commission, applyCredit, isPromoUsable,
                       sitewideSalePrice, promoAlreadyRedeemed, computeStackedDiscounts, shippingFee) — unit-tested
    credit.ts          Store credit ledger + loyalty + referrals (getBalance, reserveCredit, earnLoyalty,
                       grantReferralReward, reserveDiscountRedemption, getRewardConfig)
    orderLifecycle.ts  paidIpnAction — pure paid-IPN classifier (pending→fulfill, confirmed→resend, dead→late_payment) — tested
    square.ts          chargeSquare — Square Payments API (raw REST, no SDK): charges the exact amountDue (cents) against a
                       Web-Payments source_id; idempotency key = order id; autocomplete:true; confirms ONLY on a COMPLETED
                       capture (refuses APPROVED holds); maps decline codes to safe copy. squareConfigured() gates the card tile.
    fulfillment.ts     Shared confirm-paid-order steps (stock, emails, loyalty/referral, late-payment) — all idempotent
    requireUser/requireAdmin/requireAffiliate.ts  JWT validation (reject unverified email); admins/affiliates table checks

server/index.ts       Legacy Express server (never runs in prod or `pnpm dev`; only local path to test the NowPayments webhook)
supabase/migrations/  SQL migrations
```

**ESM import rule:** `package.json` is `"type": "module"`. All relative imports in `api/` **must** include `.js` (e.g. `./_lib/supabase-admin.js`), or `ERR_MODULE_NOT_FOUND` at runtime on Vercel.

**Vercel function limit (Hobby): 12 max — currently 12 used (8 root + 4 catch-alls), AT THE LIMIT.** Do NOT add another serverless function — fold new endpoints into an existing catch-all (public/no-auth reads → `api/public/`).

**Key data flow:**
1. Cart lives in `CartContext` (sessionStorage); `CartItem.cartCode` is the inventory key.
2. Checkout **requires sign-in** (else routes to `/login?redirect=<full path+query>` — the query string is preserved). `/checkout` = 2/3 contact+shipping (Google Places autocomplete) + 1/3 order summary. The payment area is a **method selector** (see Payments).
3. Order ID = **3 letters + dash + 6 digits** (`buildOrderId`, e.g. `KFD-837291`, nanoid; the dash is part of the stored PK — short enough to type into a Venmo/Cash App memo). Customer email in `orders.email`. `formatOrderId` renders it (legacy 20-digit IDs and `{alnum}--{base64url(email)}` IDs pass through / show the part before `--`).
4. Discounts resolved **server-side** in `create-crypto-payment` (client amounts ignored). **Stacking** (`computeStackedDiscounts`): site-wide sale baked into item prices → quantity tier % → one code (promo/affiliate % or referral flat $). **Store credit** then applies as tender, reducing cash `amountDue` (reserved in the ledger at order creation). Each line recorded in `orders.discount_breakdown`.
5. Confirmation decrements stock, sends confirmed + admin emails, earns loyalty + grants referral reward — all idempotent (`_lib/fulfillment.ts`), via the webhook/IPN or the admin Re-check.

---

## Payments

**Three methods, one checkout, server-authoritative pricing** — the server always charges/records the exact server-computed `amountDue` (stacked discounts + store credit intact), never a client price. Which methods appear is driven by `store_settings.payment_config`, surfaced (no client rebuild) via `/api/public/site` → `payments` (`buildPayments`).

**Checkout method selector (`Checkout.tsx`):** **Card (Square) · Zelle · Cash App · Venmo · Bank transfer (ACH) · Crypto.** A tile shows only when offered: **Square** when enabled AND the server has credentials (`squareConfigured()`); a **manual** method when enabled AND it has a handle; **crypto** defaults on. Handles + instructions come from `payment_config` (Admin → Payments).

**1. Square (live cards).** `SquareCardBox.tsx` tokenizes the card in-browser with the Web Payments SDK (raw PAN never touches our server) → single-use `squareToken` (`source_id`). The server (`chargeSquare` in `_lib/square.ts`) charges the exact `amountDue` (cents) via the Square Payments API, idempotency-keyed on the order id, `autocomplete:true`. Confirms **only** on a `COMPLETED` capture (refuses a bare `APPROVED` hold); decline codes map to customer-safe copy. **Synchronous — no webhook.**

**2. Manual peer-to-peer (Zelle / Cash App / Venmo / bank ACH).** No processor, no automated callback: the order is placed **pending** with `payment_method` set and the send-to handle shown (`ManualPaymentModal.tsx` + the order-success "awaiting" state with a live countdown). The customer sends the money out-of-band, puts the **order number in the memo**, and taps **"I've Sent the Payment"** → `POST /api/account/payment-sent` (own pending manual order only) emails the **payment inbox** (`admin_payment_claimed`). The admin verifies the money landed and clicks **Mark Paid** in Admin → Orders (`mark_paid` → shared `confirmPaidOrder`). Reserved store credit / one-use promo slots are held until confirmed or auto-expiry (**4 days**).

**3. Crypto (NowPayments).** No card token + a non-manual method → a NowPayments hosted invoice; the IPN (`/api/nowpayments-webhook`, HMAC-verified, amount-guarded) confirms via the shared idempotent `_lib/fulfillment.ts`. Auto-expiry **24h**.

**$0 due** (100%-off / full store credit): confirmed immediately, skips every processor.

**Confirm/reconcile:** Square confirms inline; crypto via the NowPayments IPN; manual via admin **Mark Paid** — all funnel through the idempotent `_lib/fulfillment.ts` (stock, emails, loyalty/referral). Admin **Re-check** reconciles a pending order against NowPayments.

**Go-live env (Vercel → redeploy):** live `SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID` + `SQUARE_ENVIRONMENT=production` and matching `VITE_SQUARE_APPLICATION_ID`/`VITE_SQUARE_LOCATION_ID`/`VITE_SQUARE_ENVIRONMENT=production` (client + server envs must match), then enable Square in Admin → Payments. Add each Zelle/Cash App/Venmo/ACH handle in Admin → Payments to expose that tile.

**TagadaPay is fully removed.** A former card processor, now deleted end-to-end — server helpers, client card/wallet UI, the admin webhook-registration routes, its checkout branch, and the `@tagadapay/*` dependencies. No Tagada code, routes, or env vars remain.

*NowPayments' own invoice page also offers a card/Apple-Pay on-ramp (Guardarian/Banxa) — pending NowPayments review; storefront copy left as-is by owner decision.*

---

## Product Variants (cartCode is the unique key)

| cartCode | Price | Notes |
|---|---|---|
| `retatrutide-10mg` | $129 | |
| `retatrutide-20mg` | $189 | |
| `retatrutide-30mg` | $249 | |
| `ghk-cu-50mg` | $69 | LOT B031 |
| `ghk-cu-100mg` | $109 | LOT B031 |
| `nad-500mg` | $129 | stock = 0 |
| `bac-water-10ml` | $15 | |

Free gift `bac-water-free` ($0) auto-added when subtotal ≥ $100 — **capped at qty 1** (CartContext pins it). Skip stock checks for it. Flat **$15 shipping**, free at **$100+** (`SHIPPING_FEE`/`FREE_SHIPPING_THRESHOLD` — server `_lib/pricing.ts` + client `lib/discounts.ts` mirror; pre-discount basis).

---

## Supabase Schema

**Project ID:** `mddgtvwcwsmlbwiafdvq` (us-west-2)

- `inventory(cart_code PK, stock INT CHECK ≥0, is_active BOOL, updated_at)` — availability is **stock-driven** (`stock=0` disables Add to Cart). `is_active` retained but unused.
- `orders(id PK, email, items JSONB, shipping_address JSONB, gross_amount, discount_amount, net_amount, shipping_amount, discount_code, discount_breakdown JSONB, credit_applied, referral_code, affiliate_id, commission_amount, status CHECK IN pending/confirmed/finished/failed/cancelled, payment_method (crypto|square|zelle|cashapp|venmo|ach|null), fulfillment_status CHECK IN unfulfilled/shipped/delivered, tracking_number, carrier, label_url, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, confirmed_at, created_at, emails_sent JSONB)` — `status` = payment lifecycle, `fulfillment_status` = shipping (orthogonal), `payment_method` drives the admin Mark-Paid flow + the method-aware auto-expiry. `emails_sent` = `{event: ISO ts}` idempotency log.
- `affiliates(id UUID PK, user_id→auth.users, code UNIQUE, discount_percent, commission_percent, name, email, created_at)`
- `affiliate_payouts(id UUID PK, affiliate_id→affiliates, amount>0, note, created_at)` — owed = Σ commission on paid orders − Σ payouts.
- `promo_codes(id UUID PK, code UNIQUE, percent_off 1-100, min_subtotal, max_uses NULL=∞, used_count, starts_at, expires_at, is_active, created_at)` — **one use per customer** (`promoAlreadyRedeemed`; affiliate codes unlimited). `used_count` bumps on confirmation via `increment_promo_use`.
- `store_settings(id BOOL PK singleton, sitewide_active, sitewide_percent 1-99, sitewide_label, sitewide_starts_at, sitewide_ends_at, quantity_tiers JSONB [{min_qty,percent}], loyalty_percent, referral_referee_amount, referral_referrer_amount, referral_min_subtotal, payment_config JSONB, featured-banner cols, updated_at)` — site-wide sale + quantity tiers + loyalty/referral + **`payment_config`** (per-method `{enabled, handle, instructions}` for square/zelle/cashapp/venmo/ach/crypto; drives the `/api/public/site` payment offer, edited in Admin → Payments). Managed via admin PUTs. Service-role only.
- `store_credit_ledger(id UUID PK, email, amount [+earned/−redeemed], reason loyalty|referral|redemption|manual, order_id, created_at)` — **balance derived** via `store_credit_balance(email)` RPC, which **excludes entries tied to cancelled/failed orders** (dead order auto-refunds reserved credit AND claws back earned loyalty/referral, no explicit writes). Idempotent via unique (order_id, reason).
- `referral_codes(code PK, email UNIQUE, created_at)` — one per customer (lazily created).
- `stock_waitlist(id UUID PK, cart_code, email, created_at, notified_at, UNIQUE(cart_code,email))` — back-in-stock signups.
- `discount_redemptions(email, code, order_id, created_at, PK(email,code))` — atomic one-use backstop for promo + referral (referral uses sentinel `__REFERRAL__` = one referral ever per referee). Claimed at checkout, released on abandonment + hourly sweep.
- `rate_limits(id BIGINT PK, bucket, created_at)` — sliding-window limiter (contact form).

**Key RPCs:** `decrement_stock`/`increment_stock` (atomic, raise on insufficient); `increment_promo_use`; `store_credit_balance` (excludes dead-order entries); `reserve_store_credit` (atomic check-and-reserve under advisory lock; idempotent per order); `reserve_discount_redemption`/`release_discount_redemption`/`sweep_discount_redemptions`; `rate_limit_hit`.

**Scheduled jobs (pg_cron):** `expire-stale-orders` hourly, **method-aware** (`public.expire_stale_orders()`): automated invoices (crypto/square/legacy null) die at **24h**, manual transfers (zelle/cashapp/venmo/ach) at **4 days** — expiry → cancelled, releasing reserved store credit. `email-cron` hourly → pg_net POST to `/api/cron` (CRON_SECRET) which also expires + emails cancellations (idempotent).

**RLS:** `inventory` anon-read; `products` anon-read where `is_active`; `affiliates` own-row; everything else (`orders`, `admins`, `affiliate_payouts`, `promo_codes`, `store_settings`, `store_credit_ledger`, `referral_codes`, `stock_waitlist`, `discount_redemptions`, `rate_limits`) is service-role only (RLS on, zero policies = deny-all). Verified live (July 2026 audit).

---

## Environment Variables

```bash
# Server (Vercel; SUPABASE_URL + SERVICE_ROLE_KEY auto-injected by the connector)
SUPABASE_URL= / SUPABASE_SERVICE_ROLE_KEY=
NOWPAYMENTS_API_KEY= / NOWPAYMENTS_IPN_SECRET=
# Square (live card processing) — server charge + VITE_ client tokenization (envs must match)
SQUARE_ACCESS_TOKEN=                # server access token (production or sandbox)
SQUARE_LOCATION_ID=                 # location the payment is attributed to
SQUARE_ENVIRONMENT=sandbox          # "production" | "sandbox" (default sandbox)
VITE_SQUARE_APPLICATION_ID=         # Web Payments SDK app id (in-browser card tokenization)
VITE_SQUARE_LOCATION_ID=            # client location id
VITE_SQUARE_ENVIRONMENT=sandbox     # "production" | "sandbox" — must match SQUARE_ENVIRONMENT; VITE_ → redeploy
PAYMENT_EMAIL=                      # OPTIONAL — inbox for "I've Sent the Payment" manual-transfer alerts. Falls back to
                                    # ORDERS_EMAIL → GMAIL_USER (real, monitored). Leave UNSET unless a payment@ mailbox is
                                    # actually provisioned (an unprovisioned address black-holes the alert).
# Manual P2P handles (Zelle/Cash App/Venmo/ACH) are NOT env vars — they live in store_settings.payment_config,
#   edited in Admin → Payments (a method shows at checkout only when enabled AND it has a handle).
GMAIL_USER=hello@vitumlab.com / GMAIL_APP_PASSWORD=
BASE_URL=https://vitumlab.com
ORDERS_EMAIL=orders@vitumlab.com    # admin new-paid-order alerts (falls back to GMAIL_USER)
INVENTORY_EMAIL=inventory@vitumlab.com   # low-stock digest
DELIVERED_EMAIL=delivered@vitumlab.com   # admin delivered alerts
CRON_SECRET=                        # /api/cron shared secret
SHIPPO_API_KEY=                     # ShippoToken; test vs live is key-determined (no code change). Still TEST → sample labels.
SHIP_FROM_NAME/STREET1/CITY/STATE/ZIP/PHONE   # return address (PHONE required by USPS). STREET2/EMAIL/COUNTRY optional.

# Browser (VITE_ prefix; set manually in Vercel)
VITE_SUPABASE_URL= / VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=           # optional — Places autocomplete at checkout; falls back to native autofill
```

---

## Styling Conventions

- Tailwind v4, oklch color space, inline oklch literals (no CSS color variables).
- Dark mode: `class` strategy via `ThemeContext`; `.dark` overrides in `client/src/index.css` target specific oklch values.
- Dark section headers (`bg-[oklch(0.13_0.01_260)]`) intentionally stay dark — no `dark:` override.
- Active/selected pills use `dark:bg-[oklch(0.40_0.16_260)]` cobalt blue.

---

## Deployment

- Vercel auto-deploys on push to `main`. Build → `dist/public` (static) + `dist/index.js` (unused Express fallback). API routes = `/api/*.ts`. COA PDFs are static in `public/coa/`.
- **Always ship to production without asking — standing owner approval.** For each change: open a PR, wait for CI (the Vercel deploy) to pass, then squash-merge to `main` yourself. Don't open drafts that sit waiting; don't ask "should I merge?". Note genuine risks in chat but proceed unless told to hold.
- `api/` is **excluded from `tsconfig.json`** — `pnpm check` does not type-check serverless functions; the Vercel preview build is the real compile check for them.

---

## Authentication (Supabase Auth)

Three login types share `AuthContext` + the `authedFetch` helper. Server validates the JWT via `requireUser`/`requireAdmin`/`requireAffiliate` (all **reject unverified emails**).

| Login | Route | Methods | After auth | Gated by |
|---|---|---|---|---|
| Customer | `/login`→`/account` | Google + magic link | role via `/api/me`: admin→`/admin`, affiliate→`/affiliate/dashboard`, else `/account` | — |
| Affiliate | `/affiliate/login` | magic link | `/affiliate/dashboard` | `affiliates` table |
| Admin | `/admin/login` | Google + magic link | `/admin` | `admins` table |

Customer login is the single entry point (admins land on `/admin` automatically via `/api/me`). Order history matches by **email** (not user_id), so pre-account orders appear. `/admin/*` + `/affiliate/*` render standalone (no chrome/age-gate). **Dashboard setup:** enable Google provider (Auth → Providers); add an affiliate by inserting a row.

---

## Local Dev

`pnpm dev` = Vite only; `vitePluginLocalApi` routes `/api/*` to the handler files via `server.ssrLoadModule` (except `/api/nowpayments-webhook` + `/api/cron`, which are unreachable under `pnpm dev`). Create `.env.local` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ optional `NOWPAYMENTS_API_KEY`, `GMAIL_*`).

---

## Known Gotchas

- **`vercel.json` SPA rewrite** uses a negative lookahead `/((?!api/).*)` so `/api/*` reaches functions instead of `index.html`. Don't change to `(.*)`.
- **`api/` isn't type-checked by `pnpm check`** — ESM extension errors surface only on Vercel; test against the preview.
- **Customer-facing payment copy must be processor-agnostic.** The store accepts card (Square) + manual P2P (Zelle/Cash App/Venmo/ACH) + crypto (NowPayments); the shared order-status pages (`OrderSuccess.tsx`, `OrderCancel.tsx`) say "your payment" — never name a processor/"blockchain"/"coin". `OrderSuccess` reads `?free=1`/`?awaiting=1` (+ `method`/`amt`/`exp`) for tone + manual send-to instructions, but its confirmed/processing copy stays method-neutral. The **only** places naming a method are the checkout method-selector tiles, the manual-payment modal, and the FAQ payment answer (owner-decision copy — leave as-is).

---

## Shipped Features (all built + live unless noted)

- **Payments (3 methods, 1 checkout)** — Square live cards (Web Payments SDK tokenization → synchronous server charge), manual P2P (Zelle/Cash App/Venmo/ACH: order placed pending + send-to instructions/modal; customer "I've Sent the Payment" pings the payment inbox; admin **Mark Paid** confirms), and NowPayments crypto. Method offer + manual handles configured in Admin → Payments (`store_settings.payment_config`). See **Payments** above.
- **Products** — Supabase `products` table, Admin → Products; images in `product-images` Storage bucket.
- **Admin dashboard** — Overview KPIs (revenue 30d/all-time, net profit = net − commission, orders-to-fulfill, low-stock, AOV, top sellers, repeat-customer rate), daily revenue chart (10/30/60/90d), affiliate commissions-owed breakdown. Backed by `GET /api/admin/summary` (pages 1000 rows at a time).
- **Transactional emails** (`_lib/email.ts`, idempotent via `orders.emails_sent`) — welcome, order-received, confirmed + admin new-order alert, shipped, delivered + admin alert, cancelled/expired, failed, affiliate commission (per paid order), affiliate monthly statement (cron 1st @15:00 UTC), post-delivery follow-up (7d). Per-order email log + Resend buttons in Admin → Orders.
- **Order management** — Admin → Orders: cancel (restocks paid), ship, buy label, deliver, **Mark Paid** (manual transfer landed → confirm + fulfil), recheck, notes, per-row **Delete** (hard, no restock) + **bulk select** (re-check / buy labels / mark delivered / cancel / delete) + combined **Label PDF** & **Packing slips** (4×6, via `pdf-lib`, `POST /api/admin/order-pdfs`). An awaiting-payment KPI + Orders filter surfaces pending manual transfers; each order shows a payment-method badge.
- **Shipping (Shippo, USPS)** — `buy_label` → Priority Mail Flat Rate Padded Envelope, 4×6 PDF; stores label/tracking, sets shipped, emails. **Auto-delivery:** `/api/cron` polls tracking → marks delivered + emails. Token decides test/live (currently TEST → sample labels).
- **Discounts** — general **promo codes** (Admin → Promos, one-use per customer), **affiliate codes** (unlimited, discount + commission), **site-wide sale** (% off with schedule + storefront countdown `SaleBanner`; clears per-variant sale prices), **tiered quantity discounts** (min-qty → %). Stack server-side via `computeStackedDiscounts`; only one code per order.
- **Loyalty / store credit + referrals** — store-credit wallet (`store_credit_ledger`, derived balance); loyalty % back on paid orders; referral link (`/?ref=CODE`) gives a new referee $ off first order + credits the referrer once the referee pays cash. Auto-applies as tender at checkout. Config in Admin → Promos → Loyalty & Referrals.
- **Affiliate payouts** — Admin → Affiliates: earned/paid/owed, Record Payout / Edit % / Add Affiliate. First affiliate: `asiancreativegaming@gmail.com`, code `ACG10` (10%/10%).
- **Share links** — `?code=/?ref=/?promo=` captured on landing (`capturePromoFromUrl` → localStorage), auto-applied at checkout.
- **Back-in-stock waitlist** — "Notify me" on out-of-stock variants; admin stock 0→>0 emails everyone pending. **Low-stock digest** — daily to `INVENTORY_EMAIL`.
- **Customer account** — order timeline (shared `OrderTimeline`), one-click Reorder, saved shipping address (auth metadata). **Public tracking** — `/track` (order # + matching email, no sign-in).
- **Checkout gating** — required 21+/research-use attestation (re-validated server-side); Shippo `validateAddress` (fails open).
- **SEO** — keywords/OG/Twitter/JSON-LD (Product on product pages, Organization/WebSite on home); `sitemap.xml` + `robots.txt`.

*Explicitly rejected (owner decision — do NOT build/re-suggest):* abandoned-payment/abandoned-cart reminder emails; newsletters via Gmail SMTP (needs a real ESP).

---

## Open / Outstanding

**Payments go-live (owner dashboard actions):** set live `SQUARE_ACCESS_TOKEN` + `SQUARE_LOCATION_ID` + `SQUARE_ENVIRONMENT=production` and the matching `VITE_SQUARE_*` (redeploy), then enable Square in Admin → Payments. Add each manual handle (Zelle/Cash App/Venmo/ACH) in Admin → Payments to expose it. Optionally provision a `payment@vitumlab.com` mailbox (Google Workspace user/alias/group) + set `PAYMENT_EMAIL` to route manual-transfer alerts there instead of the hello@ inbox. Swap `SHIPPO_API_KEY` to live for real postage.

**Sales tax:** the checkout has no tax line. If PA sales tax is added later it's a `create-crypto-payment` pricing change (the processors' own tax rates don't affect our headless flat-amount charge). Owner to confirm obligation with a tax pro.

**Security — outstanding owner actions (dashboards, not code):** (1) Supabase Auth → confirm "Confirm email" ON + enable leaked-password protection; (2) Google Cloud → restrict `VITE_GOOGLE_MAPS_API_KEY` by HTTP referrer; (3) move `pg_net` out of the `public` schema. *Deferred code follow-ups:* CSP header (needs per-source enumeration for Maps/Supabase/Square); admin products PATCH column allowlist; admin upload content-type/size validation; stop logging raw customer emails.

**Testing:** Vitest unit/component + a Playwright checkout e2e. Next: more coverage + CI to run `pnpm test` on PRs.
