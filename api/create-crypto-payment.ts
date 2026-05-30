import { customAlphabet } from "nanoid";

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
    const { items, email, total } = req.body as {
      items: { name: string; dose: string; quantity: number }[];
      email: string;
      total: number;
    };

    if (!items?.length || !email || !total) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const orderId = buildOrderId(email);
    const description = items
      .map((i: any) => `${i.name} ${i.dose} x${i.quantity}`)
      .join(", ");
    const baseUrl = process.env.BASE_URL || "https://vitum-lab.vercel.app";

    const nowRes = await fetch(`${NOWPAYMENTS_API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.NOWPAYMENTS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        price_amount: total,
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

    const data = (await nowRes.json()) as { invoice_url: string };
    res.status(200).json({ invoiceUrl: data.invoice_url, orderId });
  } catch (err) {
    console.error("create-crypto-payment error:", err);
    res
      .status(500)
      .json({ error: "Failed to create payment. Please try again." });
  }
}
