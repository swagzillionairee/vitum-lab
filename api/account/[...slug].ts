import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { requireUser } from "../_lib/requireUser.js";

/**
 * Handles all /api/account/* routes for the logged-in customer:
 *  - GET /api/account/orders  — order history (matched by email, so orders
 *    placed before the account existed appear too) with fulfillment/tracking
 *    fields for the status timeline.
 *  - GET /api/account/profile — saved shipping address (auth user metadata,
 *    falling back to the most recent order's address).
 *  - PUT /api/account/profile — save the shipping address.
 */
export default async function handler(req: any, res: any) {
  const user = await requireUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const pathname = ((req.url as string) ?? "").split("?")[0];
  const route = pathname.replace(/^\/api\/account\/?/, "").split("/")[0];

  if (route === "orders") {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, items, gross_amount, discount_amount, net_amount, status, fulfillment_status, tracking_number, carrier, created_at, confirmed_at, shipped_at, delivered_at, cancelled_at, cancel_reason, shipping_address",
      )
      .eq("email", user.email)
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ error: "Failed to fetch orders" });
      return;
    }
    res.status(200).json({ orders: data });
    return;
  }

  if (route === "profile") {
    if (req.method === "GET") {
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      let address = meta.shipping_address ?? null;

      if (!address) {
        // Fall back to the most recent order's address for returning customers.
        const { data: lastOrder } = await supabaseAdmin
          .from("orders")
          .select("shipping_address")
          .eq("email", user.email)
          .not("shipping_address", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        address = lastOrder?.shipping_address ?? null;
      }

      res.status(200).json({ shipping_address: address });
      return;
    }

    if (req.method === "PUT") {
      const { shipping_address } = req.body as {
        shipping_address?: {
          name?: string; line1?: string; line2?: string; city?: string;
          state?: string; postal_code?: string; country?: string; phone?: string;
        };
      };
      if (!shipping_address?.line1) {
        res.status(400).json({ error: "shipping_address with line1 is required" });
        return;
      }
      const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...meta, shipping_address },
      });
      if (error) {
        res.status(500).json({ error: "Failed to save address" });
        return;
      }
      res.status(200).json({ shipping_address });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  res.status(404).json({ error: "Not found" });
}
