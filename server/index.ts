import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import { sendOrderConfirmation } from "./lib/email.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOWPAYMENTS_API = "https://api.nowpayments.io/v1";
const genId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

// Encode customer email into order_id so webhook can retrieve it without a DB
// Format: {10-char-id}--{base64url(email)}
function buildOrderId(email: string) {
  return `${genId()}--${Buffer.from(email).toString("base64url")}`;
}
function parseEmailFromOrderId(orderId: string): string | null {
  const sep = orderId.indexOf("--");
  if (sep === -1) return null;
  try { return Buffer.from(orderId.slice(sep + 2), "base64url").toString("utf8"); }
  catch { return null; }
}

// ── Create NowPayments invoice ─────────────────────────────────────────────
async function createInvoice(
  total: number,
  orderId: string,
  description: string,
  baseUrl: string
) {
  const res = await fetch(`${NOWPAYMENTS_API}/invoice`, {
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
  if (!res.ok) throw new Error(`NowPayments error: ${await res.text()}`);
  return res.json() as Promise<{ invoice_url: string }>;
}

// ── Verify NowPayments IPN signature ─────────────────────────────────────
function sortKeys(obj: unknown): unknown {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return obj;
  return Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = sortKeys((obj as Record<string, unknown>)[key]);
      return acc;
    }, {});
}
function verifyIpn(rawBody: string, signature: string, secret: string): boolean {
  try {
    const sorted = sortKeys(JSON.parse(rawBody));
    const hmac = crypto.createHmac("sha512", secret);
    hmac.update(JSON.stringify(sorted));
    const computed = hmac.digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch { return false; }
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Webhook — raw body BEFORE express.json() so HMAC verification works
  app.post("/api/nowpayments-webhook", express.raw({ type: "*/*" }), async (req, res) => {
    const signature = req.headers["x-nowpayments-sig"] as string;
    const rawBody = (req.body as Buffer).toString("utf8");

    if (!verifyIpn(rawBody, signature, process.env.NOWPAYMENTS_IPN_SECRET!)) {
      res.status(401).send("Invalid signature");
      return;
    }

    const payload = JSON.parse(rawBody);
    const status: string = payload.payment_status;
    console.log(`ℹ️  NowPayments IPN — order ${payload.order_id}: ${status}`);

    if (status === "finished" || status === "confirmed") {
      const email = parseEmailFromOrderId(payload.order_id);
      if (email) {
        try {
          await sendOrderConfirmation(email, payload.order_id, String(payload.price_amount), String(payload.price_currency));
          console.log(`✅ Confirmation email sent to ${email}`);
        } catch (err) {
          console.error("Failed to send confirmation email:", err);
        }
      }
    }

    res.status(200).send("OK");
  });

  app.use(express.json());

  // ── Create crypto payment invoice
  app.post("/api/create-crypto-payment", async (req, res) => {
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
      const description = items.map((i) => `${i.name} ${i.dose} x${i.quantity}`).join(", ");
      const baseUrl = process.env.BASE_URL || "https://vitum-lab.vercel.app";

      console.log(`Creating invoice ${orderId}: $${total} for ${email}`);
      const { invoice_url } = await createInvoice(total, orderId, description, baseUrl);

      res.json({ invoiceUrl: invoice_url, orderId });
    } catch (err) {
      console.error("create-crypto-payment error:", err);
      res.status(500).json({ error: "Failed to create payment. Please try again." });
    }
  });

  // ── Static files
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
