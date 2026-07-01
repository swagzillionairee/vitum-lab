import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { isTagadaPaidEvent, verifyTagadaWebhook } from "./tagada.js";

describe("isTagadaPaidEvent", () => {
  it("treats order/paid and payment/succeeded (any case) as paid", () => {
    expect(isTagadaPaidEvent("order/paid")).toBe(true);
    expect(isTagadaPaidEvent("payment/succeeded")).toBe(true);
    expect(isTagadaPaidEvent("ORDER/PAID")).toBe(true);
  });

  it("treats other / unknown events as not paid", () => {
    for (const t of ["order/created", "payment/failed", "checkout/initiated", "", null, undefined]) {
      expect(isTagadaPaidEvent(t)).toBe(false);
    }
  });
});

describe("verifyTagadaWebhook", () => {
  const ORIGINAL = process.env.TAGADA_WEBHOOK_SECRET;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.TAGADA_WEBHOOK_SECRET;
    else process.env.TAGADA_WEBHOOK_SECRET = ORIGINAL;
  });

  it("accepts any payload when no secret is configured", () => {
    delete process.env.TAGADA_WEBHOOK_SECRET;
    expect(verifyTagadaWebhook('{"type":"order/paid"}', undefined)).toBe(true);
  });

  it("accepts a correct HMAC-SHA256 signature and rejects a bad/missing one", () => {
    process.env.TAGADA_WEBHOOK_SECRET = "whsec_test";
    const body = '{"type":"order/paid","data":{"id":"ord_1"}}';
    const good = crypto.createHmac("sha256", "whsec_test").update(body).digest("hex");
    expect(verifyTagadaWebhook(body, good)).toBe(true);
    expect(verifyTagadaWebhook(body, `sha256=${good}`)).toBe(true); // prefixed header
    expect(verifyTagadaWebhook(body, "deadbeef")).toBe(false);
    expect(verifyTagadaWebhook(body, undefined)).toBe(false);
    expect(verifyTagadaWebhook('{"type":"order/paid","data":{"id":"tampered"}}', good)).toBe(false);
  });
});
