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
      const baseUrl = process.env.BASE_URL || "https://vitumlab.com";

      console.log(`Creating invoice ${orderId}: $${total} for ${email}`);
      const { invoice_url } = await createInvoice(total, orderId, description, baseUrl);

      res.json({ invoiceUrl: invoice_url, orderId });
    } catch (err) {
      console.error("create-crypto-payment error:", err);
      res.status(500).json({ error: "Failed to create payment. Please try again." });
    }
  });

  // ── Contact form
  app.post("/api/contact", async (req, res) => {
    const { name, email, subject, message } = req.body as {
      name: string; email: string; subject?: string; message: string;
    };
    if (!name || !email || !message) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
      await transporter.sendMail({
        from: `"Vitum Lab Contact Form" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        replyTo: email,
        subject: `[Contact] ${subject || "Inquiry"} — from ${name}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #f4f6f9;">
            <div style="background: #0f1a2e; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <p style="margin: 0; color: #fff; font-size: 18px; font-weight: 700;">Vitum Lab — Contact Form</p>
            </div>
            <div style="background: #fff; padding: 32px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr><td style="padding: 8px 0; font-size: 13px; color: #888; width: 100px;">Name</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #111;">${name}</td></tr>
                <tr><td style="padding: 8px 0; font-size: 13px; color: #888;">Email</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #111;"><a href="mailto:${email}" style="color: #2c5fdb;">${email}</a></td></tr>
                <tr><td style="padding: 8px 0; font-size: 13px; color: #888;">Subject</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #111;">${subject || "—"}</td></tr>
              </table>
              <div style="border-top: 1px solid #eee; padding-top: 20px;">
                <p style="font-size: 13px; color: #888; margin-bottom: 8px;">Message</p>
                <p style="font-size: 15px; color: #333; line-height: 1.65; white-space: pre-wrap;">${message}</p>
              </div>
            </div>
          </div>
        `,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Contact email error:", err);
      res.status(500).json({ error: "Failed to send message. Please email us directly at hello@vitumlab.com." });
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
