# Vitum Lab — Session Notes

## What This Project Is

Vitum Lab (`vitumlab.com`) is a research peptide e-commerce site. It sells GLP-3 (R) / Retatrutide, GHK-Cu, NAD+, and BAC Water. Crypto-only checkout via NowPayments. Orders confirmed via email. Deployed on Vercel.

**Stack:** React 19 + TypeScript + Tailwind CSS (oklch color space) + wouter routing + Vite frontend. Express backend (`server/index.ts`) + Vercel serverless functions (`/api/*.ts`). No database (yet).

---

## Architecture

```
client/src/         React SPA (Vite)
  pages/            All page components
  components/       Navbar, Footer, CartDrawer, LegalPage, etc.
  lib/products.ts   Single source of truth for all product/variant data
  contexts/         CartContext (sessionStorage), ThemeContext (localStorage)
  hooks/            useInventory (stub — pending Supabase)
api/                Vercel serverless functions
  create-crypto-payment.ts   Creates NowPayments invoice
  nowpayments-webhook.ts     Confirms payment, sends email, (soon) decrements stock
  contact.ts                 Contact form → Gmail SMTP
  inventory.ts               (stub — pending Supabase)
  validate-discount.ts       (stub — pending Supabase)
  affiliate/stats.ts         (stub — pending Supabase)
  affiliate/orders.ts        (stub — pending Supabase)
server/             Express server (local dev + fallback)
lib/                Shared server utilities
  supabase-admin.ts (stub — pending Supabase credentials)
```

**Product variants** (cartCode is the unique key):
- `retatrutide-10mg` $129, `retatrutide-20mg` $189, `retatrutide-30mg` $249
- `ghk-cu-50mg` $69, `ghk-cu-100mg` $109
- `nad-500mg` $129 (Out of Stock)
- `bac-water-10ml` $12

**Order ID format:** `{10-char-alphanum}--{base64url(email)}` — email is encoded in the order ID so the webhook can send confirmation without a database.

---

## Environment Variables Required

```
# Server-side (Vercel dashboard + .env)
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
GMAIL_USER=hello@vitumlab.com
GMAIL_APP_PASSWORD=
BASE_URL=https://vitum-lab.vercel.app
SUPABASE_URL=                        ← PENDING (not yet set up)
SUPABASE_SERVICE_ROLE_KEY=           ← PENDING

# Browser (Vite, VITE_ prefix)
VITE_SUPABASE_URL=                   ← PENDING
VITE_SUPABASE_ANON_KEY=              ← PENDING
```

---

## What Was Built / Changed This Session

### Features
- **Dark mode** — Sun/Moon toggle in Navbar, persists to localStorage. Comprehensive CSS overrides for all hardcoded oklch color values across every page. Active buttons use cobalt blue in dark mode. LegalPage converted from inline styles to Tailwind dark: variants.
- **GHK-Cu lot fix** — Both 50mg and 100mg variants now show LOT: B031.
- **NAD+ Out of Stock badge** — Grey badge added.
- **Contact form** — Now POSTs to `/api/contact` (nodemailer/Gmail), no longer opens Outlook. Requires `GMAIL_USER` + `GMAIL_APP_PASSWORD` in Vercel env vars.

### Dark Mode Details
- `index.css` — `.dark` CSS variable overrides + targeted class overrides for all `oklch(...)` background, text, and border values used across the site.
- All text minimum lightness `0.72` on `0.12` dark background for WCAG compliance.
- Dark section headers (`bg-[oklch(0.13_0.01_260)]`) intentionally left alone — they stay dark in dark mode.
- Active pills/buttons (dose selector, shop filter) use `dark:bg-[oklch(0.40_0.16_260)]` cobalt.

### Previously Built (earlier sessions)
- NowPayments crypto checkout with email-in-order-ID trick
- Gmail confirmation email on webhook
- COA Library with real PDFs (`/coa/Retatrutide_COA.pdf`, etc.)
- Reconstitution calculator
- Research Library page with real peer-reviewed studies
- Affiliate/discount code UI stubs in CartDrawer (state exists, not wired)
- Return Policy, LegalPage redesign, all legal pages
- Age gate, cookie consent, back-to-top
- USPS Priority Mail shipping copy everywhere (2 days East Coast, 3 days Central/West)
- Store address: 1300 S Columbus Blvd, Philadelphia, PA 19147

---

## Known Issues / Open Items

| Item | Status |
|------|--------|
| Contact form | Works once `GMAIL_USER` + `GMAIL_APP_PASSWORD` are set in Vercel dashboard |
| Gmail App Password | Previous one was exposed in chat — user must regenerate at myaccount.google.com/apppasswords |
| Supabase inventory + affiliates | **BLOCKED — waiting for user to create Supabase project** |

---

## Next Logical Step — Supabase Integration (BLOCKED on credentials)

A full implementation plan is at `/root/.claude/plans/sprightly-wobbling-cookie.md`.

### What the user needs to do first:
1. Create a Supabase project at supabase.com
2. Run the SQL schema in Supabase SQL Editor (see plan file for full SQL)
3. Provide: Project URL, anon key, service_role key

### What gets built once credentials are provided (all planned, not yet coded):

**Phase 1 — Supabase clients**
- `lib/supabase-admin.ts` — server client (service role)
- `client/src/lib/supabase.ts` — browser client (anon key)

**Phase 2 — Inventory UI**
- `api/inventory.ts` — public GET returning stock per cartCode
- `client/src/hooks/useInventory.ts` — fetches stock, exposes `isAvailable()` + `stockLabel()`
- `Shop.tsx` + `ProductDetail.tsx` — show "X left" badge, disable OOS buttons

**Phase 3 — Order persistence + stock decrement**
- `api/create-crypto-payment.ts` — validate stock before invoice, store pending order in Supabase
- `api/nowpayments-webhook.ts` — decrement stock atomically on confirmed payment, update order status
- CartDrawer — pass `cartCode` + `price` per item (currently only sends `name, dose, quantity`)
- Supabase `decrement_stock()` RPC handles race conditions (atomic UPDATE WHERE stock >= qty)

**Phase 4 — Discount codes**
- `api/validate-discount.ts` — validates affiliate code, returns discount %
- `CartDrawer.tsx` — wire existing `promoCode` state to the API, show discounted total

**Phase 5 — Affiliate dashboard**
- `lib/requireAffiliate.ts` — JWT validation middleware for protected routes
- `api/affiliate/stats.ts` — total orders, revenue, commission (protected)
- `api/affiliate/orders.ts` — paginated order list (protected)
- `client/src/pages/AffiliateLogin.tsx` — Supabase magic link login
- `client/src/pages/AffiliateDashboard.tsx` — stats cards + recharts line chart + orders table
- `App.tsx` — add `/affiliate/login` and `/affiliate/dashboard` routes

### Supabase SQL schema (copy-paste ready):
Full schema is in the plan file. Tables: `inventory`, `orders`, `affiliates`. Key function: `decrement_stock(p_cart_code, p_qty)`.

---

## Deployment

- Vercel auto-deploys on push to `main`
- Branch: `main` (all work committed here)
- Static build: `vite build` → `dist/public`
- API routes: `/api/*.ts` → Vercel serverless functions
- All env vars must be set in Vercel Project Settings → Environment Variables
