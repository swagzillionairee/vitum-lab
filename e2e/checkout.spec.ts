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
      localStorage.setItem("vitum_cookie_consent", "accepted");
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
    if (url.includes("/api/public/site")) return json({
      sitewide: { active: false },
      quantity_tiers: [],
      payments: {
        square: { enabled: false },
        zelle: { enabled: false, handle: "", instructions: "" },
        cashapp: { enabled: false, handle: "", instructions: "" },
        venmo: { enabled: false, handle: "", instructions: "" },
        ach: { enabled: false, handle: "", instructions: "" },
        crypto: { enabled: true },
      },
    });
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

  // 10% off $129 = $12.90; $129 clears the $75 free-shipping threshold, so
  // shipping is $0 → total $116.10.
  await expect(page.getByText(/10%/)).toBeVisible();
  await expect(page.getByText("$116.10")).toBeVisible();

  // Attest, then submit via the (only enabled) crypto method — the mock returns
  // a "free" order so the app navigates to /order-success in-app.
  await page.getByRole("checkbox", { name: /I confirm I am at least 21/i }).check();
  await page.getByRole("button", { name: /Continue with crypto/i }).click();
  await page.waitForURL(/\/order-success/);

  // The submitted payload is correct.
  expect(capture.body).toBeTruthy();
  // The order email is now derived server-side from the JWT, not sent in the body.
  expect(capture.body.email).toBeUndefined();
  expect(capture.body.discountCode).toBe("SAVE10");
  // $129 clears the $75 free-shipping threshold and the $100 gift threshold, so
  // the free BAC Water rides along (server re-derives it authoritatively regardless).
  expect(capture.body.items.some((i: { cartCode: string }) => i.cartCode === "retatrutide-10mg")).toBe(true);
  expect(capture.body.items.some((i: { cartCode: string }) => i.cartCode === "bac-water-free")).toBe(true);
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
  await page.getByRole("checkbox", { name: /I confirm I am at least 21/i }).check();

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

test("mobile checkout fields and payment methods remain comfortably usable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only layout regression coverage");

  await seedBrowser(page);
  await mockApi(page, {});
  await page.route("**/api/public/site**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      sitewide: { active: false },
      quantity_tiers: [],
      payments: {
        square: { enabled: false },
        zelle: { enabled: true, handle: "payments@example.com", instructions: "" },
        cashapp: { enabled: true, handle: "$vitumlab", instructions: "" },
        venmo: { enabled: true, handle: "@vitumlab", instructions: "" },
        ach: { enabled: false, handle: "", instructions: "" },
        crypto: { enabled: true },
      },
    }) }),
  );

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  const cityBox = await page.getByPlaceholder("City").boundingBox();
  const stateBox = await page.getByPlaceholder("State").boundingBox();
  const zipBox = await page.getByPlaceholder("ZIP").boundingBox();
  expect(cityBox?.width).toBeGreaterThan(200);
  expect(stateBox?.width).toBeGreaterThan(100);
  expect(zipBox?.width).toBeGreaterThan(100);

  for (const name of ["Zelle", "Cash App", "Venmo", "Crypto"]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThanOrEqual(70);
  }

  const viewportMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);
});

test("mobile navigation and cart controls stay reachable at 320px", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only shell regression coverage");

  await seedBrowser(page);
  await mockApi(page, {});
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const shopNow = page.getByRole("link", { name: "Shop Now" }).last();
  await shopNow.scrollIntoViewIfNeeded();
  await expect(shopNow).toBeInViewport();

  await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("button", { name: "Shopping cart" }).click();
  await expect(page.getByRole("dialog", { name: "Shopping cart" })).toBeVisible();

  for (const name of ["Close cart", "Decrease quantity", "Increase quantity", "Remove GLP-3 (R)"]) {
    const control = page.getByRole("button", { name });
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  const viewportMetrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);
});
