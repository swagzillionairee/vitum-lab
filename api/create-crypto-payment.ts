import { customAlphabet } from "nanoid";
import { supabaseAdmin } from "./_lib/supabase-admin.js";

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
const genId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

function buildOrderId(email: string) {
  return `${genId()}--${Buffer.from(email).toString("base64url")}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { items, email, total, discountCode, affiliateId, discountAmount } = req.body as {
      items: { name: string; dose: string; quantity: number; cartCode: string; price: number }[];
      email: string;
      total: number;
      discountCode?: string;
      affiliateId?: string;
      discountAmount?: number;
    };

    if (!items?.length || !email || !total) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Validate stock for each item (skip free gifts with price 0)
    const paidItems = items.filter((i) => i.price > 0 && i.cartCode !== "bac-water-free");
    for (const item of paidItems) {
      const { data } = await supabaseAdmin
        .from("inventory")
        .select("stock")
        .eq("cart_code", item.cartCode)
        .maybeSingle();

      if (data && data.stock < item.quantity) {
        res.status(409).json({ error: `${item.name} ${item.dose} is out of stock.` });
        return;
      }
    }

    const orderId = buildOrderId(email);
    const grossAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const netAmount = total;
    const description = paidItems
      .map((i) => `${i.name} ${i.dose} x${i.quantity}`)
      .join(", ");
    const baseUrl = process.env.BASE_URL || "https://vitum-lab.vercel.app";

    // Persist pending order
    await supabaseAdmin.from("orders").insert({
      id: orderId,
      email,
      status: "pending",
      items: items.map((i) => ({ name: i.name, dose: i.dose, quantity: i.quantity, cartCode: i.cartCode, price: i.price })),
      gross_amount: grossAmount,
      discount_amount: discountAmount ?? 0,
      net_amount: netAmount,
      discount_code: discountCode ?? null,
      affiliate_id: affiliateId ?? null,
    });

    const nowRes = await fetch(`${NOWPAYMENTS_API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: netAmount,
        price_currency: "usd",
        order_id: orderId,
        order_description: description,
        ipn_callback_url: `${baseUrl}/api/nowpayments-webhook`,
        success_url: `${baseUrl}/order-success?order=${orderId}`,
        cancel_url: `${baseUrl}/order-cancel`,
        is_fixed_rate: false,
        is_fee_paid_by_user: false,
      }),
    });

    if (!nowRes.ok) {
      console.error("NowPayments error:", await nowRes.text());
      res.status(500).json({ error: "Failed to create payment" });
      return;
    }

    const data = await nowRes.json() as { invoice_url: string };
    res.status(200).json({ invoiceUrl: data.invoice_url, orderId });
  } catch (err) {
    console.error("create-crypto-payment error:", err);
    res.status(500).json({ error: "Failed to create payment. Please try again." });
  }
}
