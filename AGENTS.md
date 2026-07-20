# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, and others) working in this repository.

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research-peptide e-commerce site (Retatrutide/GLP-3 (R), GHK-Cu, NAD+, BAC Water). Checkout offers **card, manual peer-to-peer, and crypto — see [Payments](#payments)**. Deployed on Vercel; Supabase backs inventory/orders/affiliates.

**Stack:** React 19 + TypeScript + Tailwind CSS v4 (oklch color space) + wouter routing + Vite. Local dev serves `/api/*` via `vitePluginLocalApi` in `vite.config.ts`; production uses Vercel serverless functions (`/api/*.ts`).

---

## Commands

```bash
pnpm dev          # Vite dev server (port 3000) — API routes handled inline via vitePluginLocalApi
pnpm build        # vite build → dist/public
pnpm check        # TypeScript type-check, client + Vercel API (tsc --noEmit && tsc -p tsconfig.api.json)
pnpm test         # Vitest (run once) — unit (Node) + component (jsdom)
pnpm test:watch   # Vitest watch mode
pnpm test:e2e     # Playwright e2e (checkout) — run `pnpm exec playwright install chromium` first
pnpm format       # Prettier
```

Tests use **Vitest** (`vitest.config.ts`). API/pure-logic tests run in Node; component tests opt into jsdom with `@vitest-environment jsdom` + `@testing-library/react`. `esbuild.jsx: "automatic"` lets `.tsx` tests skip a React import. **Playwright** e2e in `e2e/` mocks every `/api/*` call + seeds the age-gate cookie + a fake Supabase session (no live backend). No lint script — use `pnpm check`.

The Vite root is `client/` (not repo root). Path alias `@` → `client/src`.

---

## Architecture

```
client/src/
  pages/            Shop, ProductDetail, Home, COALibrary, Checkout, Account, AdminDashboard, OrderSuccess, OrderCancel, …
    admin/          AdminDashboard split: types.ts, shared.tsx (formatters, <Kpi>, <RevenueChart>, <Field>),
                    ProductModal.tsx, and self-contained ShippingTab/CustomersTab/PromosTab/AffiliatesTab/PaymentsTab.
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
    discounts.ts    quantityDiscountPercent/round2/shippingFee + threshold constants — client mirror of the checkout math
  contexts/         CartContext (localStorage; free gift capped at qty 1; reconcileCartPrices re-syncs to live catalog),
                    ThemeContext (dark mode), AuthContext (Supabase Auth)
  hooks/
    useInventory.ts /api/inventory → isAvailable/stockLabel/stockDisplay (capped "50+")
    useProducts.ts  /api/products (dbRowToProduct → Product, sale strikethrough); falls back to lib/products.ts
    useSiteConfig.ts  fetchSiteConfig() — one shared cached GET /api/public/site per page load

api/                Vercel serverless functions — ALL relative imports MUST use .js extensions (ESM; see rule below)
  inventory.ts                GET → {cartCode: stock} (capped 50); POST → join back-in-stock waitlist (public)
  create-crypto-payment.ts    POST (REQUIRES auth) — the ONE checkout charge endpoint (legacy filename). Order email =
                              JWT email (never the body). Server-authoritative re-pricing + stacked discounts + store
                              credit; routes by `paymentMethod` (see Payments).
  nowpayments-webhook.ts      POST (raw body, HMAC-verified, amount-guarded) — crypto confirm/fail via _lib/fulfillment
  validate-discount.ts        POST (REQUIRES auth) — early UI validation of affiliate/promo codes
  contact.ts                  POST (rate-limited 5/10min/IP)
  me.ts                       GET → {email, isAdmin, isAffiliate} (+ one-time welcome email)
  products.ts                 GET → active product list (public); projects the active site-wide sale onto sale_price
  cron.ts                     GET/POST — hourly: expire stale orders + email sweep + low-stock digest @14:00 UTC
                              + Shippo delivery polling → delivered/follow-up emails + affiliate statements (1st @15:00). CRON_SECRET.
  admin/[...slug].ts          Catch-all /api/admin/*: summary, inventory (PATCH 0→stock emails waitlist), orders GET +
                              PATCH actions, products CRUD, upload, affiliates, payouts, promos, site-promo,
                              quantity-tiers, rewards, payment-config GET/PUT (Admin → Payments), order-pdfs (4×6
                              labels/slips via pdf-lib), waitlist, users, shipments.
                              Order PATCH actions: cancel, ship, buy_label, deliver, mark_paid, recheck, notes,
                              resend_email, redact (PII strip, financial row preserved). DELETE → hard delete (no restock; single + bulk).
  affiliate/[...slug].ts      Catch-all /api/affiliate/* (stats, orders)
  account/[...slug].ts        Catch-all /api/account/*: orders, profile GET/PUT (saved shipping address), credit, referral,
                              data-export (self-serve JSON of the customer's own data), payment-sent POST (customer tapped
                              "I've Sent the Payment" on their OWN pending manual order → alerts the payment inbox; idempotent)
  public/[...slug].ts         Catch-all /api/public/* (no auth): site GET (sale banner + quantity_tiers + referral_program +
                              `payments` offer via buildPaymentOffer), track GET ?order=&email= (rate-limited)
  _lib/
    supabase-admin.ts  Service-role Supabase client (env via requireEnv)
    env.ts             requireEnv(name, feature) — missing-env errors that name the var + the feature it powers
    orderId.ts         buildOrderId — 3 letters + dash + 6 digits (e.g. "KFD-837291", nanoid); formatOrderId (legacy IDs)
    vt-logo.ts         Base64 logo for packing-slip PDFs
    email.ts           ALL transactional email (one Gmail transport + branded layout; idempotent via orders.emails_sent,
                       claimed BEFORE sending via claim_email). notifyAdmin() = ops alerts. deferEmail() = waitUntil with
                       local fallback. Inbox resolvers fall back to real mailboxes (ORDERS_EMAIL → GMAIL_USER, etc.).
                       Manual-method emails inject the send-to handle from store_settings.payment_config.
    shippo.ts          USPS labels (buyLabel, 4×6 PDF) + getTrackingStatus + validateAddress; token decides test/live
    paymentConfig.ts   buildPaymentOffer — shapes store_settings.payment_config into the checkout method offer
    pricing.ts         Pure order math + promo validation (grossFromItems, computeStackedDiscounts, applyCredit,
                       cashPaidBasis, isPromoUsable, promoRedemptionCount, sitewideSalePrice, shippingFee, round2) — unit-tested
    credit.ts          Store credit ledger + loyalty + referrals (getBalance, reserveCredit, earnLoyalty,
                       grantReferralReward, reserveDiscountRedemption, getRewardConfig); uses pricing.round2/cashPaidBasis
    orderLifecycle.ts  paidIpnAction — pure paid-IPN classifier (pending→fulfill, confirmed→resend, dead→late_payment) — tested
    square.ts          chargeSquare — Square Payments API (raw REST, no SDK); charges exact amountDue (cents) against a
                       Web-Payments source_id; idempotency key = order id; autocomplete:true; confirms ONLY on a COMPLETED
                       capture (refuses APPROVED holds); maps decline codes to safe copy; notifyAdmin on anomalies.
                       squareConfigured() gates the card tile.
    fulfillment.ts     Shared confirm-paid-order steps (confirmPaidOrder + emails, loyalty/referral, late-payment) — all idempotent
    requireUser/requireAdmin/requireAffiliate.ts  JWT validation (reject unverified email); admins/affiliates table checks

supabase/migrations/  SQL migrations
```

**ESM import rule:** `package.json` is `"type": "module"`. All relative imports in `api/` **must** include `.js` (e.g. `./_lib/supabase-admin.js`), or `ERR_MODULE_NOT_FOUND` at runtime on Vercel. `pnpm check` + CI catch this.

**Vercel function limit (Hobby): 12 max — 12 used (8 root + 4 catch-alls), AT THE LIMIT.** Do NOT add another serverless function — fold new endpoints into an existing catch-all (public/no-auth reads → `api/public/`). Escape options in [Owner Risk Register](#owner-risk-register).

**Key data flow:**
1. Cart lives in `CartContext` (localStorage; `sessionStorage` read once as a migration fallback); `CartItem.cartCode` is the inventory key.
2. Checkout **requires sign-in** (else routes to `/login?redirect=<full path+query>` — query string preserved). `/checkout` = 2/3 contact+shipping (Google Places autocomplete) + 1/3 order summary with the payment method selector.
3. Order ID = **3 letters + dash + 6 digits** (`buildOrderId`, e.g. `KFD-837291`, nanoid; the dash is part of the stored PK — short enough to type into a Venmo/Cash App memo). Customer email in `orders.email`. `formatOrderId` renders it (legacy 20-digit and `{alnum}--{base64url(email)}` IDs pass through).
4. **Discounts + pricing resolved server-side** in `create-crypto-payment` (client amounts ignored). Stacking (`computeStackedDiscounts`): site-wide sale baked into item prices → quantity-tier % → one code (promo/affiliate % or referral flat $). **Store credit** then applies as tender, reducing cash `amountDue` (reserved in the ledger at order creation). The server charges/records the exact server-computed `amountDue`. Each line recorded in `orders.discount_breakdown`.
5. Confirmation decrements stock, sends confirmed + admin emails, earns loyalty + grants referral reward — all idempotent (`_lib/fulfillment.ts`), via the webhook/IPN, admin Mark Paid, or admin Re-check.

---

## Payments

**Three methods, one checkout, server-authoritative pricing** (the exact `amountDue` — see Key data flow #4). Which methods appear is driven by `store_settings.payment_config`, surfaced without a client rebuild via `/api/public/site` → `payments` (`buildPaymentOffer`), edited in **Admin → Payments** (PaymentsTab).

**Checkout method selector (`Checkout.tsx`):** **Card (Square) · Zelle · Cash App · Venmo · Bank transfer (ACH) · Crypto.** A tile shows only when offered: **Square** when enabled AND the server has credentials (`squareConfigured()`); a **manual** method when enabled AND it has a handle; **crypto** when enabled AND `NOWPAYMENTS_API_KEY` is set (defaults on). Tiles are brand-coloured per method (`METHOD_STYLE`); the Card tile shows inline-SVG accepted-card marks. The order summary has a two-stage $75/$100 free-shipping/free-gift nudge, pastel trust chips, and an optional **Shipping Protection** checkbox.

**How `create-crypto-payment` routes by `paymentMethod`:**
- **$0 due** (100%-off / full store credit) → confirmed immediately, skips every processor.
- **Card (`square`)** → `chargeSquare` charges the card **synchronously, no webhook**; confirms only on a `COMPLETED` capture. `SquareCardBox.tsx` tokenizes in-browser (raw PAN never hits our server). *(Mechanics: `_lib/square.ts`.)*
- **Manual (`zelle`/`cashapp`/`venmo`/`ach`)** → order placed **pending** with the send-to handle shown (`ManualPaymentModal.tsx` + the order-success "awaiting" countdown). Customer sends money out-of-band with the **order number in the memo**, taps **"I've Sent the Payment"** (`POST /api/account/payment-sent` → alerts the payment inbox). Admin verifies and clicks **Mark Paid** in Admin → Orders. Auto-expires if unpaid (see [Scheduled jobs](#supabase-schema)).
- **Crypto** → a NowPayments hosted invoice; the IPN (`/api/nowpayments-webhook`, HMAC-verified, amount-guarded) confirms it. Auto-expires if unpaid.

**Confirm/reconcile:** all paths funnel through the idempotent `_lib/fulfillment.ts` (stock, emails, loyalty/referral). Admin **Re-check** reconciles a pending crypto order against NowPayments. Reserved store credit / one-use promo slots are held until confirmed or auto-expiry.

**Customer-facing payment copy must stay processor-agnostic.** The shared order-status pages (`OrderSuccess.tsx`, `OrderCancel.tsx`) say "your payment" — never name a processor/"blockchain"/"coin". `OrderSuccess` reads `?free=1`/`?awaiting=1` (+ `method`/`amt`/`exp`) for tone + manual send-to instructions, but its confirmed/processing copy stays method-neutral. The **only** places naming a method are the checkout tiles, the manual-payment modal, and the FAQ payment answer (owner-decision copy — leave as-is).

*Go-live steps: see [Open / Outstanding](#open--outstanding). TagadaPay (a former card processor) is fully removed — no code, routes, or env vars remain. NowPayments' invoice page also offers a card/Apple-Pay on-ramp (Guardarian/Banxa) — storefront copy left as-is by owner decision.*

---

## Product Variants (cartCode is the unique key)

Live prices/stock come from Supabase `products` via `/api/products` — authoritative, do NOT hardcode them elsewhere. `lib/products.ts` holds only static fallback defaults. Stable `cartCode` keys (the inventory join key):

`retatrutide-10mg` · `retatrutide-20mg` · `retatrutide-30mg` · `ghk-cu-50mg` · `ghk-cu-100mg` · `nad-500mg` · `bac-water-10ml` (+ additional catalog SKUs: `bpc-157-10mg`, `cjc-ipamorelin-10mg`, `mots-c-10mg`, `tb-500-10mg`, `tesamorelin-10mg`).

Free gift `bac-water-free` ($0) auto-added when subtotal ≥ **$100** (`FREE_GIFT_THRESHOLD`) — **capped at qty 1** (CartContext pins it); skip stock checks for it. Flat **$10 shipping**, free at **$75+** (`SHIPPING_FEE` / `FREE_SHIPPING_THRESHOLD`, pre-discount basis). **Free shipping ($75) and the free gift ($100) are separate thresholds.** Optional **Shipping Protection** add-on (`SHIPPING_PROTECTION_FEE` $15) folds into `shipping_amount`. All four constants are mirrored server (`_lib/pricing.ts`) + client (`lib/discounts.ts`) — a **pricing-parity test** fails CI if they drift.

---

## Supabase Schema

**Project ID:** `mddgtvwcwsmlbwiafdvq` (us-west-2)

- `inventory(cart_code PK, stock INT CHECK ≥0, is_active BOOL, updated_at)` — availability is **stock-driven** (`stock=0` disables Add to Cart). `is_active` retained but unused.
- `orders(id PK, email, items JSONB, shipping_address JSONB, gross_amount, discount_amount, net_amount, shipping_amount, discount_code, discount_breakdown JSONB, credit_applied, referral_code, affiliate_id, commission_amount, status CHECK IN pending/confirmed/finished/failed/cancelled, payment_method (crypto|square|zelle|cashapp|venmo|ach|null), fulfillment_status CHECK IN unfulfilled/shipped/delivered, tracking_number, carrier, label_url, shipped_at, delivered_at, cancelled_at, cancel_reason, admin_notes, pay_currency, pay_amount, payment_id, confirmed_at, created_at, emails_sent JSONB, attestation JSONB)` — `status` = payment lifecycle, `fulfillment_status` = shipping (orthogonal). `shipping_amount` = shipping fee **plus** any opted-in Shipping Protection. `emails_sent` = `{event: ISO ts}` idempotency log (claimed atomically BEFORE sending via `claim_email`; a failed send releases the claim). `attestation` = `{accepted, at, ip, version}` — durable record of the checkout 21+/research-use acknowledgment (null on legacy orders).
- `affiliates(id UUID PK, user_id→auth.users, code UNIQUE, discount_percent, commission_percent, name, email, created_at)`
- `affiliate_payouts(id UUID PK, affiliate_id→affiliates, amount>0, note, created_at)` — owed = Σ commission on paid orders − Σ payouts.
- `promo_codes(id UUID PK, code UNIQUE, percent_off 1-100, min_subtotal, max_uses NULL=∞, used_count, per_customer_limit (default 1, 0=∞), starts_at, expires_at, is_active, created_at)` — **per-customer cap** = `per_customer_limit` (enforced via `promoRedemptionCount`, counting paid orders since the promo's `created_at`; affiliate codes unlimited). Deleting a code clears its `discount_redemptions` and the historical scan is bounded by `created_at`, so **delete+recreate resets the limit for everyone**. `used_count` is bumped **inline inside the `confirm_order_paid` transaction** (guarded by `max_uses`).
- `store_settings(id BOOL PK singleton, sitewide_active/percent/label/starts_at/ends_at, quantity_tiers JSONB [{min_qty,percent}], loyalty_percent, payment_config JSONB, featured-banner cols, updated_at)` — plus **two referral models**: legacy loyalty/referral (`referral_referee_amount`, `referral_referrer_amount`, `referral_min_subtotal` — read by `credit.ts getRewardConfig`) and the self-serve **referral program** (`referral_program_active`, `referral_buyer_discount`, `referral_bounty_amount`, `referral_bounty_orders`, `referral_min_order` — drives the public `/referral` page + `/api/public/site`). Service-role only; managed via admin PUTs.
- `store_credit_ledger(id UUID PK, email, amount [+earned/−redeemed], reason loyalty|referral|redemption|manual, order_id, created_at)` — **balance derived** via `store_credit_balance(email)` RPC, which **excludes entries tied to cancelled/failed orders** (dead order auto-refunds reserved credit AND claws back earned loyalty/referral). Idempotent via unique (order_id, reason).
- `referral_codes(code PK, email UNIQUE, created_at)` — one per customer (lazily created).
- `stock_waitlist(id UUID PK, cart_code, email, created_at, notified_at, UNIQUE(cart_code,email))` — back-in-stock signups.
- `discount_redemptions(email, code, order_id, created_at, PK(email,code,order_id))` — atomic per-customer backstop for promo + referral: `reserve_discount_redemption(email, code, order_id, limit)` counts slots per (email,code) under an advisory lock (referral uses sentinel `__REFERRAL__` = one referral ever per referee). Claimed at checkout, released on abandonment + hourly sweep, cleared when its promo is deleted.
- `rate_limits(id BIGINT PK, bucket, created_at)` — sliding-window limiter (`rate_limit_hit`) gating contact, checkout, discount validation, waitlist, and public order tracking.

**`payment_config` extras:** `blocked_states` (array of 2-letter codes) — ship-to-state blocklist enforced server-side at checkout (no admin UI yet; set via SQL). A disabled manual method's `handle`/`instructions` are stripped from `/api/public/site`.

**Key RPCs:** `confirm_order_paid` / `cancel_order` (the WHOLE payment claim + stock + promo mutation as one Postgres transaction — cancel restocks only unfulfilled paid orders); `decrement_stock`/`increment_stock` (atomic, raise on insufficient); `claim_email`/`release_email_claim` (atomic claim-before-send email idempotency); `record_affiliate_payout` (capped at outstanding under advisory lock); `store_credit_balance` (excludes dead-order entries); `reserve_store_credit` (atomic check-and-reserve; idempotent per order); `reserve_discount_redemption`/`release_discount_redemption`/`sweep_discount_redemptions`; `rate_limit_hit`.

**Scheduled jobs (pg_cron):** `expire_stale_orders()` hourly cancels unpaid orders past their **method-aware window** — automated invoices (crypto/square/legacy null) at **24h**, manual transfers (zelle/cashapp/venmo/ach) at **4 days** — releasing reserved store credit. `email-cron` hourly → pg_net POST to `/api/cron` (CRON_SECRET) which also expires + emails cancellations (idempotent).

**RLS:** `inventory` anon-read; `products` anon-read where `is_active`; `affiliates` own-row; everything else (`orders`, `admins`, `affiliate_payouts`, `promo_codes`, `store_settings`, `store_credit_ledger`, `referral_codes`, `stock_waitlist`, `discount_redemptions`, `rate_limits`) is service-role only (RLS on, zero policies = deny-all).

---

## Environment Variables

```bash
# Server (Vercel; SUPABASE_URL + SERVICE_ROLE_KEY auto-injected by the connector)
SUPABASE_URL= / SUPABASE_SERVICE_ROLE_KEY=
NOWPAYMENTS_API_KEY= / NOWPAYMENTS_IPN_SECRET=
# Square (live card processing) — server charge + VITE_ client tokenization (envs must match)
SQUARE_ACCESS_TOKEN=                # server access token (production or sandbox)
SQUARE_LOCATION_ID=                 # location the payment is attributed to
SQUARE_ENVIRONMENT=production       # "production" | "sandbox" — production in the current Vercel deployment
VITE_SQUARE_APPLICATION_ID=         # Web Payments SDK app id (in-browser card tokenization)
VITE_SQUARE_LOCATION_ID=            # client location id
VITE_SQUARE_ENVIRONMENT=production  # "production" | "sandbox" — currently matches SQUARE_ENVIRONMENT; VITE_ → redeploy
PAYMENT_EMAIL=                      # OPTIONAL override for "I've Sent the Payment" alerts. Falls back to
                                    # ORDERS_EMAIL → GMAIL_USER. No dedicated payments mailbox is planned.
# Manual P2P handles (Zelle/Cash App/Venmo/ACH) are NOT env vars — they live in store_settings.payment_config
#   (Admin → Payments); a method shows at checkout only when enabled AND it has a handle.
GMAIL_USER=hello@vitumlab.com / GMAIL_APP_PASSWORD=
BASE_URL=https://vitumlab.com
ORDERS_EMAIL=orders@vitumlab.com    # admin new-paid-order + ops alerts (falls back to GMAIL_USER)
INVENTORY_EMAIL=inventory@vitumlab.com   # low-stock digest
DELIVERED_EMAIL=delivered@vitumlab.com   # admin delivered alerts
CRON_SECRET=                        # /api/cron shared secret (checked constant-time, header-only)
SHIPPO_API_KEY=                     # ShippoToken; currently demo/test. Keep non-live until real postage is authorized.
SHIP_FROM_NAME/STREET1/CITY/STATE/ZIP/PHONE   # return address (PHONE required by USPS). STREET2/EMAIL/COUNTRY optional.

# Browser (VITE_ prefix; set manually in Vercel)
VITE_SUPABASE_URL= / VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=           # optional — Places autocomplete at checkout; falls back to native autofill
```

Missing required vars fail loudly via `requireEnv()` (names the var + the feature it powers).

---

## Styling Conventions

- Tailwind v4, oklch color space. Components mostly use **inline oklch literals** rather than a per-color token layer (a small set of shadcn-style theme tokens + `--background` exists in `index.css`, but most colours are inline).
- Dark mode: `class` strategy via `ThemeContext`; `.dark` overrides in `client/src/index.css` target specific oklch values. Dark section headers (`bg-[oklch(0.13_0.01_260)]`) intentionally stay dark. Active/selected pills use `dark:bg-[oklch(0.40_0.16_260)]` cobalt.
- **Soft pastel canvas:** global `--background` is a barely-tinted lavender-white; `.bg-page` (+ its `.dark` override) is applied to storefront page roots. Reusable pastel tint utilities in `index.css` (`.bg-tint-lav/mint/peach/rose/sky` + `.page-hero-tint`).
- **Legibility:** `.font-bold` is overridden to `font-weight:800` site-wide; muted-grey text tokens are darkened for contrast; error text is `red-600` (AA).
- **Checkout method tiles** are brand-coloured via `METHOD_STYLE` in `Checkout.tsx` (square=indigo, zelle=purple, cashapp=green, venmo=blue, ach=teal, crypto=bitcoin-orange); the Card tile's accepted-card marks (`CardBrands()`) are forced light so the dark override can't invert them.
- **Favicon:** full Vitum Lab logo on white — `client/public/favicon.ico` + png sizes + `apple-touch-icon.png`, linked in `client/index.html`.
- Storefront product/hero art is served as **WebP**. Do not restore the retired multi-megabyte PNG originals.
- Global cart/cookie-banner/floating-cart transitions use lightweight CSS keyframes in `index.css` — keep them CSS-only (no animation runtime in the initial bundle).

---

## Deployment

- Vercel auto-deploys on push to `main`. Build → `dist/public` (static). API routes = `/api/*.ts`. COA PDFs are static in `client/public/coa/` (served at `/coa/`).
- **Always ship to production without asking — standing owner approval.** For each change: open a PR, wait for CI + the Vercel deploy, then squash-merge to `main` yourself. Don't open drafts that sit waiting; don't ask "should I merge?". Note genuine risks in chat but proceed unless told to hold.
- **CI** (`.github/workflows/ci.yml`) gates every PR + push to `main` on `pnpm check` (client + `api/` via `tsconfig.api.json`) and `pnpm test`. The Vercel preview remains the final runtime compile check. (The e2e suite isn't in CI — needs browsers, occasionally flaky in constrained containers; passes in isolation.)

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

`vitePluginLocalApi` routes `/api/*` to the handler files via `server.ssrLoadModule`, **except** `/api/nowpayments-webhook` + `/api/cron` (unreachable under `pnpm dev`). Create `.env.local` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ optional `NOWPAYMENTS_API_KEY`, `GMAIL_*`).

---

## Known Gotchas

- **`vercel.json` SPA rewrite** uses a negative lookahead `/((?!api/).*)` so `/api/*` reaches functions instead of `index.html`. Don't change to `(.*)`.
- The **ESM `.js`-extension rule** (see Architecture) and **CI gating** (see Deployment) are the two things most likely to bite — both are enforced but only surface at build/runtime.
- **Payment copy must stay processor-agnostic** on shared order-status pages (see Payments).

---

## Shipped Features (all built + live unless noted)

- **Payments** — card (Square) + manual P2P + crypto; see [Payments](#payments).
- **Products** — Supabase `products` table, Admin → Products; images in `product-images` Storage bucket.
- **Admin dashboard** — Overview KPIs (revenue 30d/all-time, net profit = net − commission, orders-to-fulfill, low-stock, AOV, top sellers, repeat-customer rate, awaiting-payment), daily revenue chart (10/30/60/90d), affiliate commissions-owed breakdown. Backed by `GET /api/admin/summary` (pages 1000 rows at a time).
- **Order management** — Admin → Orders: cancel (restocks paid), ship, buy label, deliver, **Mark Paid**, recheck, notes, **redact** (PII strip, financial row preserved), per-row **Delete** (hard) + **bulk select** + combined **Label PDF** & **Packing slips** (4×6, `pdf-lib`). Awaiting-payment KPI/filter + payment-method badges.
- **Transactional emails** (`_lib/email.ts`, idempotent via `orders.emails_sent` + `claim_email`) — welcome, order-received, confirmed + admin new-order alert, shipped, delivered + admin alert, cancelled/expired, failed, affiliate commission (per paid order), affiliate monthly statement (cron 1st @15:00 UTC), post-delivery follow-up (7d). Per-order email log + Resend buttons. `notifyAdmin()` ops alerts (e.g. Square payment anomalies).
- **Shipping (Shippo, USPS)** — `buy_label` → USPS Ground Advantage, 4×6 PDF; stores label/tracking, sets shipped, emails. **Auto-delivery:** `/api/cron` polls tracking → marks delivered + emails. Token decides test/live.
- **Discounts** — **promo codes** (Admin → Promos, per-customer cap), **affiliate codes** (unlimited, discount + commission), **site-wide sale** (% off + schedule + storefront countdown `SaleBanner`), **tiered quantity discounts**. Stack server-side; only one code per order.
- **Loyalty / store credit + referrals** — store-credit wallet (`store_credit_ledger`, derived balance); loyalty % back on cash paid; referral link (`/?ref=CODE`) gives a new referee $ off first order + credits the referrer once the referee pays cash (reward basis = `cashPaidBasis`, credit attributed to shipping first). Auto-applies as tender. Config in Admin → Promos.
- **Affiliate payouts** — Admin → Affiliates: earned/paid/owed, Record Payout / Edit % / Add Affiliate. First affiliate: `asiancreativegaming@gmail.com`, code `ACG10` (10%/10%).
- **Share links** — `?code=/?ref=/?promo=` captured on landing (localStorage), auto-applied at checkout.
- **Back-in-stock waitlist** — "Notify me" on out-of-stock variants; OOS grid cards on Shop/Home deep-link to the PDP `#notify` form; admin stock 0→>0 emails everyone pending. **Low-stock digest** — daily to `INVENTORY_EMAIL`.
- **Customer account** — order timeline (`OrderTimeline`), one-click Reorder, saved shipping address, self-serve **data export** (`GET /api/account/data-export`). **Public tracking** — `/track` (order # + matching email, no sign-in, rate-limited).
- **Cart & checkout UX** — cart persists in **localStorage** (survives the magic-link login round-trip); one-tap BAC Water cross-sell in the drawer; two-stage $75/$100 nudge; payment errors render under the pay button; `/api/public/site` load failure auto-retries + offers Try again.
- **Checkout gating** — required 21+/research-use attestation (re-validated server-side + persisted to `orders.attestation`); ship-to-state blocklist; Shippo `validateAddress` (fails open).
- **Dose calculator** — public (nav + PDP + canonical), an organic-search entry point.
- **SEO** — keywords/OG/Twitter/JSON-LD (Product with `shippingDetails`+`priceValidUntil` + BreadcrumbList on product pages, FAQPage on /faq, Organization/WebSite on home); static OG/Twitter fallbacks in `index.html`; complete `sitemap.xml` + `robots.txt`. (Merchant return-policy schema omitted — see Risk Register.)
- **A11y** — skip link, dialog roles, keyboard marquee pause, labelled inputs, aria-pressed method tiles, red-600 error contrast.
- **Testing** — Vitest unit/component incl. the client/server **pricing-parity** test; Playwright checkout e2e. Gated by CI (see Deployment).

*Explicitly rejected (owner decision — do NOT build/re-suggest):* abandoned-payment/abandoned-cart reminder emails; newsletters via Gmail SMTP (needs a real ESP).

---

## Open / Outstanding

**Payments — current status / remaining owner actions:** Square is live: the server credentials use `SQUARE_ENVIRONMENT=production`, the matching `VITE_SQUARE_*` variables are deployed, and Square is enabled in Admin → Payments. Add each manual handle (Zelle/Cash App/Venmo/ACH) in Admin → Payments to expose it. `SHIPPO_API_KEY` intentionally remains on the demo/test key for now; do not switch it to live until real postage is authorized.

**Security — outstanding owner actions (dashboards, not code):** (1) Supabase Auth → confirm "Confirm email" ON + enable leaked-password protection; (2) Google Cloud → restrict `VITE_GOOGLE_MAPS_API_KEY` by HTTP referrer; (3) assess the Supabase `pg_net` extension warning during a maintenance window.

*(A July 2026 security audit hardened the code paths — server-only RPC grants, atomic role binding, fail-closed webhook secrets + capped raw bodies, trusted-IP/account/email rate limits, server-side cart re-pricing + quantity caps, atomic welcome-email claims, sanitized redirects/HTML, CSP/security headers in `vercel.json`, a 5 MB + image-MIME cap on the public bucket. RLS verified live.)*

---

## Owner Risk Register

Decisions/actions only the owner can take — do NOT build around them without sign-off.

1. **Payment-rail survival (highest business risk):** Zelle/Venmo/Cash App consumer AUPs prohibit research-chemical sales and freeze accounts holding business-pattern inflows; Square can hold reserves/offboard high-risk categories. Action: processor-risk review — prefer business Zelle via a business bank + a high-risk-friendly card processor; sweep balances out daily; retain representment documentation.
2. **Data disaster recovery:** orders + store-credit + affiliate-payout ledgers live in ONE Supabase project behind one service key, with no backup story. Action: enable PITR and/or a nightly logical export of `orders` + ledger tables (can fold into `/api/cron`); write a restore runbook.
3. **Email deliverability:** all transactional mail rides one Gmail app-password (no SPF/DKIM/DMARC; ~1.5-2k/day cap; the waitlist blast is burst-shaped). A confirmation in spam reads as "my charge failed" → chargebacks. Action: move to an ESP (Resend/Postmark/SES) on a sending subdomain; keep `sendEmail()` as the seam; batch the waitlist blast.
4. **Analytics:** none exist — conversion, funnel drop-off, and affiliate/referral ROI are unmeasurable. Owner picks a privacy-first vendor (Plausible/PostHog recommended; a Google/Meta pixel risks ad-account bans in this category); wiring is ~1 day and gates on the existing (currently-unread) cookie-consent value.
5. **Commission-on-credit policy:** affiliate commission is deliberately net-based regardless of store-credit tender (documented at the charge site in `create-crypto-payment.ts`). Confirm or switch to the cash-paid basis.
6. **PII retention:** `redact` + data-export are shipped, but no automatic retention window purges old shipping addresses. Decide a window (e.g. anonymize N months post-delivery).
7. **Fraud/chargeback controls:** checkout has a rate limiter but no order-value ceiling, per-card velocity, or AVS/CVV rejection policy. Decide thresholds before card volume grows.
8. **Function ceiling** (12/12, see Architecture): cheapest unlock is Vercel Pro; alternative is consolidating through the Express server as one function.
9. **Sales tax:** no tax line at checkout; owner to confirm obligation with a tax pro (a single pricing change in `create-crypto-payment` if required — the processors' own tax rates don't affect the headless flat-amount charge).
10. **Return-policy schema:** product structured data omits `hasMerchantReturnPolicy` until the owner states actual return terms.
