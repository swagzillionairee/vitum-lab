import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("./requireUser.js", () => ({ requireUser: mocks.requireUser }));
vi.mock("./supabase-admin.js", () => ({ supabaseAdmin: { from: mocks.from } }));

import { requireAffiliate } from "./requireAffiliate.js";

type Row = {
  id: string;
  code: string;
  name: string;
  discount_percent: number;
  commission_percent: number;
  user_id: string | null;
  email: string;
  is_referral: boolean;
};

function queryFor(rows: Row[]) {
  const filters: Array<[keyof Row, unknown]> = [];
  const query = {
    select: () => query,
    eq: (key: keyof Row, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    maybeSingle: async () => ({
      data: rows.find((row) => filters.every(([key, value]) => row[key] === value)) ?? null,
    }),
  };
  return query;
}

describe("requireAffiliate", () => {
  beforeEach(() => {
    mocks.requireUser.mockReset();
    mocks.from.mockReset();
    mocks.requireUser.mockResolvedValue({ id: "user-1", email: "buyer@example.com" });
  });

  it("rejects a self-serve referral participant", async () => {
    const rows: Row[] = [{
      id: "ref-1",
      code: "BUYER10",
      name: "Buyer",
      discount_percent: 10,
      commission_percent: 0,
      user_id: "user-1",
      email: "buyer@example.com",
      is_referral: true,
    }];
    mocks.from.mockImplementation(() => queryFor(rows));

    await expect(requireAffiliate({ headers: {} })).resolves.toBeNull();
  });

  it("accepts a linked curated affiliate", async () => {
    const rows: Row[] = [{
      id: "affiliate-1",
      code: "PARTNER10",
      name: "Partner",
      discount_percent: 10,
      commission_percent: 15,
      user_id: "user-1",
      email: "buyer@example.com",
      is_referral: false,
    }];
    mocks.from.mockImplementation(() => queryFor(rows));

    await expect(requireAffiliate({ headers: {} })).resolves.toMatchObject({
      id: "affiliate-1",
      code: "PARTNER10",
    });
  });
});
