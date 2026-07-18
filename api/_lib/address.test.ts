import { describe, expect, it } from "vitest";
import { normalizeShippingAddress } from "./address.js";

const valid = {
  name: "Ada Lovelace",
  line1: "123 Main St",
  line2: "",
  city: "Boston",
  state: "ma",
  postal_code: "02108",
  country: "us",
  phone: "",
};

describe("normalizeShippingAddress", () => {
  it("normalizes a contiguous-US address and drops unknown keys", () => {
    expect(normalizeShippingAddress({ ...valid, ignored: "nope" })).toEqual({
      ...valid,
      state: "MA",
      country: "US",
    });
  });

  it("rejects non-US/non-contiguous, malformed, and oversized addresses", () => {
    expect(normalizeShippingAddress({ ...valid, state: "HI" })).toBeNull();
    expect(normalizeShippingAddress({ ...valid, country: "CA" })).toBeNull();
    expect(normalizeShippingAddress({ ...valid, postal_code: "not-a-zip" })).toBeNull();
    expect(normalizeShippingAddress({ ...valid, line1: "x".repeat(201) })).toBeNull();
  });
});
