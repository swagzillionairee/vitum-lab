# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research peptide e-commerce site selling GLP-3 (R) / Retatrutide, GHK-Cu, NAD+, and BAC Water. Crypto-only checkout via NowPayments. Deployed on Vercel.

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
`api/admin/inventory.ts` (GET/PATCH stock+active), `api/admin/orders.ts`,
`api/affiliate/stats.ts`, `api/affiliate/orders.ts`.

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

## Open Work

**Product management** — built and live. Products are stored in the Supabase `products` table and managed via the Admin → Products tab. Images are stored in the `product-images` Supabase Storage bucket.
