import { describe, it, expect } from "vitest";
import { paidIpnAction } from "./orderLifecycle.js";

describe("paidIpnAction", () => {
  it("fulfills a pending order", () => {
    expect(paidIpnAction("pending")).toBe("fulfill");
  });

  it("re-sends the idempotent emails on duplicate IPNs for an already-confirmed order", () => {
    expect(paidIpnAction("confirmed")).toBe("resend_emails");
    expect(paidIpnAction("finished")).toBe("resend_emails");
  });

  it("flags a late payment on a dead order instead of confirming it", () => {
    expect(paidIpnAction("cancelled")).toBe("late_payment");
    expect(paidIpnAction("failed")).toBe("late_payment");
  });

  it("treats an unknown/missing status conservatively as emails-only (never fulfills)", () => {
    expect(paidIpnAction(undefined)).toBe("resend_emails");
    expect(paidIpnAction(null)).toBe("resend_emails");
    expect(paidIpnAction("something-new")).toBe("resend_emails");
  });
});
