import { test, expect, type Page } from "@playwright/test";

/*
 * Checkout flow e2e. The checkout page is gated by (a) the age cookie and
 * (b) a signed-in Supabase session, and it talks to several /api/* routes.
 * We seed the cookie + a fake session in localStorage and a cart in
 * sessionStorage, then mock every /api/* call — so the test exercises the real
 * checkout UI + submit payload without any live backend.
 */

const PROJECT_REF = "test"; // matches VITE_SUPABASE_URL=https://test.supabase.co
const CUSTOMER_EMAIL = "e2e@vitumlab.com";

const CART = [
  { id: "retatrutide-10mg", name: "GLP-3 (R)", dose: "10 MG", price: 129, img: "/x.png", cartCode: "retatrutide-10mg", quantity: 1 },
];

async function seedBrowser(page: Page) {
  await page.addInitScript(
    ({ ref, email, cart }) => {
      // Age gate
      document.cookie = "vitum_age_verified=true; path=/";
      // Fake, unexpired Supabase session so AuthContext sees a signed-in user
      const session = {
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "00000000-0000-0000-0000-000000000000",
          aud: "authenticated",
          role: "authenticated",
          email,
          app_metadata: { provider: "email", providers: ["email"] },
          user_metadata: {},
          identities: [],
          created_at: new Date().toISOString(),
        },
      };
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
      sessionStorage.setItem("vitum_cart", JSON.stringify(cart));
    },
    { ref: PROJECT_REF, email: CUSTOMER_EMAIL, cart: CART },
  );
}

// Mock every /api/* route the checkout (and surrounding chrome) might hit.
async function mockApi(page: Page, capture: { body?: unknown }) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/api/me")) return json({ email: CUSTOMER_EMAIL, isAdmin: false, isAffiliate: false });
    if (url.includes("/api/account/profile")) return json(method === "PUT" ? { ok: true } : { shipping_address: null });
    if (url.includes("/api/validate-discount")) return json({ valid: true, discountPct: 10 });
    if (url.includes("/api/create-crypto-payment")) {
      capture.body = route.request().postDataJSON();
      // Return a "free" order so the app navigates to /order-success in-app
      // (no external NowPayments redirect to follow).
      return json({ free: true, orderId: "abcdefghij--ZTJlQHZpdHVtbGFiLmNvbQ" });
    }
    if (url.includes("/api/products")) return json([]);
    if (url.includes("/api/inventory")) return json({});
    return json({});
  });
}

test("customer can fill checkout, apply a promo, and submit", async ({ page }) => {
  const capture: { body?: any } = {};
  await seedBrowser(page);
  await mockApi(page, capture);

  await page.goto("/checkout");

  // Auth + non-empty cart → the checkout form renders.
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  // Subtotal reflects the seeded cart.
  await expect(page.getByText("$129.00").first()).toBeVisible();

  // Contact + shipping. The email is read-only and prefilled from the account
  // (the server uses the JWT email, so it isn't an editable field anymore).
  await expect(page.locator('input[type="email"][readonly]')).toHaveValue(CUSTOMER_EMAIL);
  await page.getByPlaceholder("Full name").fill("Jane Researcher");
  await page.getByPlaceholder("Street address").fill("123 Lab St");
  await page.getByPlaceholder("City").fill("Austin");
  await page.getByPlaceholder("State").fill("TX");
  await page.getByPlaceholder("ZIP").fill("78701");

  // Apply a promo code.
  await page.getByRole("button", { name: /Have a promo code/i }).click();
  await page.getByPlaceholder("Enter code").fill("SAVE10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Promo code applied!")).toBeVisible();

  // 10% off $129 = $12.90, + $15 flat shipping (under $150) → total $131.10.
  await expect(page.getByText(/10%/)).toBeVisible();
  await expect(page.getByText("$15.00")).toBeVisible();
  await expect(page.getByText("$131.10")).toBeVisible();

  // Submit → lands on the in-app success page for the $0/"free" path.
  await page.getByRole("button", { name: /Continue to Payment/i }).click();
  await page.waitForURL(/\/order-success/);

  // The submitted payload is correct.
  expect(capture.body).toBeTruthy();
  // The order email is now derived server-side from the JWT, not sent in the body.
  expect(capture.body.email).toBeUndefined();
  expect(capture.body.discountCode).toBe("SAVE10");
  expect(capture.body.items).toHaveLength(1);
  expect(capture.body.items[0].cartCode).toBe("retatrutide-10mg");
  expect(capture.body.shipping.line1).toBe("123 Lab St");
  expect(capture.body.shipping.state).toBe("TX");
});

test("manual method (Venmo) shows the payment-instructions modal, not the empty cart", async ({ page }) => {
  await seedBrowser(page);

  // Base mocks, then override /api/public/site (Venmo enabled) + the charge
  // (returns an awaiting-manual order). Later routes take priority in Playwright.
  await mockApi(page, {});
  await page.route("**/api/public/site**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      sitewide: { active: false },
      quantity_tiers: [],
      payments: {
        square: { enabled: false },
        zelle: { enabled: false, handle: "", instructions: "" },
        cashapp: { enabled: false, handle: "", instructions: "" },
        venmo: { enabled: true, handle: "@vitumlab-pay", instructions: "" },
        ach: { enabled: false, handle: "", instructions: "" },
        crypto: { enabled: false },
      },
    }) }),
  );
  await page.route("**/api/create-crypto-payment", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      awaiting: true, method: "venmo", orderId: "12345678901234567890",
    }) }),
  );

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  await page.getByPlaceholder("Full name").fill("Jane Researcher");
  await page.getByPlaceholder("Street address").fill("123 Lab St");
  await page.getByPlaceholder("City").fill("Austin");
  await page.getByPlaceholder("State").fill("TX");
  await page.getByPlaceholder("ZIP").fill("78701");
  // Required research-use attestation.
  await page.getByRole("checkbox").check();

  // Select Venmo and place the order.
  await page.getByRole("button", { name: "Venmo", exact: false }).first().click();
  await page.getByRole("button", { name: /Pay with Venmo/i }).click();

  // The modal must appear (NOT the empty-cart screen).
  await expect(page.getByText("Complete your Venmo payment in 3 steps")).toBeVisible();
  await expect(page.getByText("@vitumlab-pay")).toBeVisible();
  await expect(page.getByText("12345678901234567890")).toBeVisible();
  await expect(page.getByText(/Missing order ID = automatic refund/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /I've Sent the Payment/i })).toBeVisible();
  await expect(page.getByText("Your cart is empty")).toHaveCount(0);
});
