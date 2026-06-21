import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import { isPayramPaidStatus, verifyPayramWebhook } from "./payram.js";

describe("isPayramPaidStatus", () => {
  it("treats FILLED / OVER_FILLED (any case) as paid", () => {
    expect(isPayramPaidStatus("FILLED")).toBe(true);
    expect(isPayramPaidStatus("OVER_FILLED")).toBe(true);
    expect(isPayramPaidStatus("filled")).toBe(true);
  });

  it("treats in-progress / partial / unknown states as not paid", () => {
    for (const s of ["OPEN", "VERIFYING", "PARTIALLY_FILLED", "", null, undefined]) {
      expect(isPayramPaidStatus(s)).toBe(false);
    }
  });
});

describe("verifyPayramWebhook", () => {
  const ORIGINAL = process.env.PAYRAM_WEBHOOK_SECRET;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PAYRAM_WEBHOOK_SECRET;
    else process.env.PAYRAM_WEBHOOK_SECRET = ORIGINAL;
  });

  it("accepts any payload when no secret is configured (unsigned mode)", () => {
    delete process.env.PAYRAM_WEBHOOK_SECRET;
    expect(verifyPayramWebhook('{"status":"FILLED"}', undefined)).toBe(true);
  });

  it("accepts a correct HMAC-SHA256 signature and rejects a bad or missing one", () => {
    process.env.PAYRAM_WEBHOOK_SECRET = "shhh-secret";
    const body = '{"invoice_id":"123","status":"FILLED"}';
    const good = crypto.createHmac("sha256", "shhh-secret").update(body).digest("hex");
    expect(verifyPayramWebhook(body, good)).toBe(true);
    expect(verifyPayramWebhook(body, "deadbeef")).toBe(false);
    expect(verifyPayramWebhook(body, undefined)).toBe(false);
    // A tampered body no longer matches the original signature.
    expect(verifyPayramWebhook('{"invoice_id":"123","status":"OPEN"}', good)).toBe(false);
  });
});
