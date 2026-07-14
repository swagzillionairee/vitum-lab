import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./clientIp.js";

const originalVercel = process.env.VERCEL;

afterEach(() => {
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

describe("clientIp", () => {
  it("uses Vercel's edge-provided real IP", () => {
    process.env.VERCEL = "1";
    expect(clientIp({ headers: { "x-real-ip": "203.0.113.9" }, socket: { remoteAddress: "127.0.0.1" } })).toBe(
      "203.0.113.9",
    );
  });

  it("ignores spoofable forwarding headers outside Vercel", () => {
    delete process.env.VERCEL;
    expect(
      clientIp({
        headers: { "x-real-ip": "198.51.100.7", "x-forwarded-for": "192.0.2.8" },
        socket: { remoteAddress: "127.0.0.1" },
      }),
    ).toBe("127.0.0.1");
  });

  it("rejects malformed edge values", () => {
    process.env.VERCEL = "1";
    expect(clientIp({ headers: { "x-real-ip": "not-an-ip" } })).toBe("unknown");
  });
});
