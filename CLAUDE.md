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

## Current Architecture (post-refactor — differs from comments above)

The architecture section above is partially outdated. Here is what was actually built:

### Serverless Functions (Vercel Hobby plan — max 12 functions)

Current 10 functions in `api/`:
- `contact.ts`, `inventory.ts`, `validate-discount.ts`, `create-crypto-payment.ts`, `nowpayments-webhook.ts`
- `me.ts` — role check (admin/affiliate/customer)
- `products.ts` — `GET /api/products` → all products from Supabase (30s cache)
- `account/orders.ts` — customer order history by email
- `admin/[...slug].ts` — catch-all for `/api/admin/inventory`, `/api/admin/orders`, `/api/admin/products`, `/api/admin/upload`
- `affiliate/[...slug].ts` — catch-all for `/api/affiliate/stats`, `/api/affiliate/orders`

**IMPORTANT:** All shared server utilities live in `api/_lib/` (NOT `server/lib/`). Vercel's bundler (`nft`) cannot reliably include files outside the `api/` tree. The `_` prefix means Vercel does not treat these as API endpoints.
- `api/_lib/supabase-admin.ts` — service-role Supabase client
- `api/_lib/requireUser.ts`, `requireAdmin.ts`, `requireAffiliate.ts`, `email.ts`

Route parsing in catch-all handlers uses `req.url` directly (NOT `req.query.slug`) because `vercel.json` rewrites intercept before Vercel injects slug params.

### Supabase Schema (additional table)

- `products(id UUID PK, slug UNIQUE, name, full_name, category, tagline, description, long_description, card_bg, badge, variants JSONB, specs JSONB, storage_instructions, reconstitution_note, research_notes JSONB, coa_href, is_active BOOL, display_order INT, created_at, updated_at)`
  - RLS: `public_read_active_products` — SELECT WHERE is_active = true (anon readable)
  - Seeded with 4 products: retatrutide, ghkcu, nad, bacwater
- `product-images` storage bucket — public, 5MB limit, images only

### Client-side product loading

`client/src/hooks/useProducts.ts` — fetches `/api/products`, falls back to static `products.ts` on error. Exports `invalidateProductsCache()` for post-edit refresh. Shop and ProductDetail pages use this hook instead of static import.

`ProductVariant` in `client/src/lib/products.ts` has optional `salePrice?` and `saleEndsAt?` fields.

### Admin Dashboard (`client/src/pages/AdminDashboard.tsx`)

3-tab layout: **Products | Inventory | Orders**
- Products tab: list with image preview, edit/delete, Add Product button, modal editor for all fields including variants (price, sale price, sale_ends_at, image upload via signed URL)
- Inventory tab: stock editing + active/hidden toggle per cart code
- Orders tab: paginated order table with status badges
- Uses `authedFetch` from `@/lib/api` (attaches JWT Bearer token)

## Open Work / Known Issues

### Admin Products tab shows "No products yet" — UNRESOLVED

**Symptom:** `/admin` → Products tab renders empty ("No products yet. Add one above.") even though 4 products exist in Supabase `products` table (all `is_active = true`).

**What has been tried:**
1. Products table exists and is seeded — confirmed via Supabase SQL.
2. `api/_lib/` refactor — moved all shared utilities into `api/_lib/` to fix `ERR_MODULE_NOT_FOUND` (Vercel bundler issue). Latest deployment `dpl_59ZBmsRS4Jo9paVdAbCZznPSTZKC` is live.
3. Vercel runtime logs show no new errors after the fix deployment — but admin Products tab still shows empty.

**Next debugging steps:**
- Check what `GET /api/admin/products` actually returns in production (Network tab in browser DevTools while on `/admin`).
- Check whether the admin auth (`requireAdmin`) is succeeding — if it returns 401, `AdminDashboard.tsx` sets `authorized=false` and redirects away before products load.
- Check `GET /api/products` (public, no auth) — if this also returns empty, the issue is with the `products` table query or RLS policy.
- Inspect `AdminDashboard.tsx` fetch logic to ensure it calls `/api/admin/products` (not the old individual endpoint path).
- Verify `api/admin/[...slug].ts` route parsing: `pathname.replace(/^\/api\/admin\/?/, "").split("/")[0]` should yield `"products"` for `/api/admin/products`.
