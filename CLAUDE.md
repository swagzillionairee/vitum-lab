# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research peptide e-commerce site selling GLP-3 (R) / Retatrutide, GHK-Cu, NAD+, and BAC Water. Crypto-only checkout via NowPayments. Deployed on Vercel.

**Stack:** React 19 + TypeScript + Tailwind CSS v4 (oklch color space) + wouter routing + Vite. Express backend (`server/index.ts`) for local dev. Vercel serverless functions (`/api/*.ts`) in production. Supabase for inventory, orders, and affiliates.

---

## Commands

```bash
pnpm dev          # Start Vite dev server (port 3000) + Express API proxy
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
  pages/            Page components (Shop, ProductDetail, Home, COALibrary, etc.)
  components/       Navbar, Footer, CartDrawer, LegalPage, ReconstitutionCalculator, etc.
  lib/
    products.ts     Single source of truth — all product/variant data and cartCodes
    supabase.ts     Browser Supabase client (anon key via VITE_SUPABASE_ANON_KEY)
  contexts/         CartContext (sessionStorage), ThemeContext (dark mode → localStorage)
  hooks/
    useInventory.ts Fetches /api/inventory, exposes isAvailable(cartCode)/stockLabel(cartCode)

api/                Vercel serverless functions (each file = one route)
  inventory.ts                GET  /api/inventory → {cartCode: stock} map
  create-crypto-payment.ts   POST /api/create-crypto-payment
  nowpayments-webhook.ts     POST /api/nowpayments-webhook (raw body, HMAC-verified)
  validate-discount.ts       POST /api/validate-discount
  contact.ts                 POST /api/contact

server/
  index.ts          Express server (local dev only — proxies /api/* to the same handlers)
  lib/
    supabase-admin.ts  Service-role Supabase client (SUPABASE_SERVICE_ROLE_KEY)
    email.ts           Nodemailer/Gmail helpers
```

**Key data flow:**
1. Cart items live in `CartContext` (sessionStorage). `CartItem.cartCode` is the inventory key.
2. Checkout: CartDrawer → `POST /api/create-crypto-payment` → NowPayments invoice URL → redirect.
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
- `inventory(cart_code PK, stock INT CHECK >= 0, is_active BOOL, updated_at)`
- `orders(id PK, email, items JSONB, gross_amount, discount_amount, net_amount, discount_code, affiliate_id, commission_amount, status CHECK IN pending/confirmed/finished/failed, confirmed_at, created_at)`
- `affiliates(id UUID PK, user_id → auth.users, code UNIQUE, discount_percent, commission_percent, name, created_at)`

Key RPC: `decrement_stock(p_cart_code TEXT, p_qty INT) → INT` — atomic UPDATE WHERE stock >= qty, raises `P0001 insufficient_stock` on failure.

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

## Open Work

**Authentication roadmap** (Supabase Auth — Google OAuth + magic link). Three independent login types, build in this order:

1. **Admin login** (you) — single admin identified via `admins` table (or `is_admin` flag). Google login. Admin dashboard for inventory management (edit stock, toggle `is_active`), order overview, and affiliate management. Replaces editing inventory directly in the Supabase dashboard.
2. **Affiliate login** — magic-link email only (small closed group, no Google). See affiliate dashboard files below.
3. **Customer login** — Google OAuth + magic link. `profiles` table linked to `auth.users`; `orders` gets a `user_id` column; checkout optionally attaches the logged-in user's ID. "My Account" page with order history + status. Note: orders placed before an account exists cannot be retroactively linked.

**Affiliate Dashboard files** (not yet built):
- `server/lib/requireAffiliate.ts` — Supabase JWT validation middleware
- `api/affiliate/stats.ts` + `api/affiliate/orders.ts` — protected endpoints
- `client/src/pages/AffiliateLogin.tsx` — Supabase magic link login
- `client/src/pages/AffiliateDashboard.tsx` — stats + recharts chart + orders table
- `client/src/App.tsx` — add `/affiliate/login` and `/affiliate/dashboard` routes

**Product management** (considered, not built): move catalog from `products.ts` into a Supabase `products` table with `sale_price`/`sale_ends_at` columns; store images in a Supabase Storage bucket and reference by URL. Enables price/sale/product edits without redeploying.

To test discount codes end-to-end, insert a row into the `affiliates` table first.
