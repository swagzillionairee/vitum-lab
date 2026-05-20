import crypto from "node:crypto";

function sortKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  // Read raw body for signature verification
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks).toString("utf8");

  const signature = req.headers["x-nowpayments-sig"] as string;

  try {
    const payload = JSON.parse(rawBody);
    const sorted = sortKeys(payload);
    const hmac = crypto.createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET!);
    hmac.update(JSON.stringify(sorted));
    const computed = hmac.digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))) {
      res.status(401).send("Invalid signature");
      return;
    }

    const status: string = payload.payment_status;
    if (status === "finished" || status === "confirmed") {
      console.log(`✅ Payment confirmed — order ${payload.order_id}, ${payload.price_amount} USD`);
      // TODO: send confirmation email once Google Workspace is configured
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(400).send("Bad request");
  }
}
