/*
 * email.ts — single source of truth for ALL transactional email.
 * One Nodemailer transport (Gmail SMTP), one branded layout, one send<Event>
 * per email type, and per-order idempotency via orders.emails_sent JSONB.
 *
 * Keep the transport isolated here so a later swap to a transactional ESP
 * (Resend/Postmark) is a one-file change.
 */

import nodemailer from "nodemailer";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "./supabase-admin.js";
import { formatOrderId } from "./orderId.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface EmailOrderItem {
  name: string;
  dose: string;
  quantity: number;
  cartCode: string;
  price: number;
}

export interface EmailAddress {
  name?: string; line1?: string; line2?: string; city?: string;
  state?: string; postal_code?: string; country?: string; phone?: string;
}

export interface EmailOrder {
  id: string;
  email: string;
  items?: EmailOrderItem[] | null;
  gross_amount?: number | string | null;
  discount_amount?: number | string | null;
  discount_code?: string | null;
  net_amount: number | string;
  shipping_amount?: number | string | null;
  credit_applied?: number | string | null;
  payment_method?: string | null;
  shipping_address?: EmailAddress | null;
  tracking_number?: string | null;
  carrier?: string | null;
  cancel_reason?: string | null;
  status?: string;
  emails_sent?: Record<string, string> | null;
}

export type OrderEmailEvent =
  | "order_created" | "confirmed" | "shipped" | "delivered"
  | "cancelled" | "failed" | "admin_new_order" | "admin_delivered"
  | "admin_late_payment" | "followup";

// ─── Transport / env ─────────────────────────────────────────────────────────
let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return _transporter;
}

const baseUrl = () => process.env.BASE_URL || "https://vitumlab.com";
const ordersInbox = () => process.env.ORDERS_EMAIL || process.env.GMAIL_USER!;
const deliveredInbox = () => process.env.DELIVERED_EMAIL || process.env.ORDERS_EMAIL || process.env.GMAIL_USER!;

async function send(to: string, subject: string, html: string) {
  await transporter().sendMail({ from: `"Vitum Lab" <${process.env.GMAIL_USER}>`, to, subject, html });
}

/** Make a product image URL absolute so it loads inside an email client. */
function absoluteUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return `${baseUrl()}${u.startsWith("/") ? "" : "/"}${u}`;
}

/** cartCode → absolute thumbnail URL, read once from the products table. */
async function productImageMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("products").select("variants");
  const map: Record<string, string> = {};
  for (const p of data ?? []) {
    for (const v of ((p.variants as { cart_code?: string; image_url?: string }[]) ?? [])) {
      if (v.cart_code && v.image_url) map[v.cart_code] = absoluteUrl(v.image_url);
    }
  }
  // The free gift reuses the BAC Water product photo.
  if (map["bac-water-10ml"] && !map["bac-water-free"]) map["bac-water-free"] = map["bac-water-10ml"];
  return map;
}

/**
 * Run an email promise without blocking the response. Uses Vercel's
 * waitUntil so the lambda stays alive after res ends; falls back to a
 * detached promise in local dev where waitUntil has no request context.
 */
export function deferEmail(p: Promise<unknown>) {
  const guarded = p.catch((err) => console.error("email send failed:", err));
  try {
    waitUntil(guarded);
  } catch {
    void guarded;
  }
}

// ─── Idempotency (orders.emails_sent JSONB) ──────────────────────────────────
// Atomic JSONB merge in SQL: the old read-merge-write here lost a stamp when two
// different events raced (re-arming a duplicate email later).
async function stampEmail(orderId: string, event: string) {
  const { error } = await supabaseAdmin.rpc("stamp_email", { p_order_id: orderId, p_event: event });
  if (error) console.error(`stamp_email(${orderId}, ${event}) failed:`, error.message);
}

// ─── Shared layout + fragments ───────────────────────────────────────────────
const money = (n: number | string | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;

// What the customer actually owes/paid: merchandise net + shipping, minus any
// store credit applied as tender (0/absent on legacy orders). Without the
// credit term, receipts and the admin "new paid order $X" alert overstate the
// real charge whenever credit covered part of the order.
const orderTotal = (order: EmailOrder) =>
  Math.max(0, (Number(order.net_amount) || 0) + (Number(order.shipping_amount) || 0) - (Number(order.credit_applied) || 0));

// Escape any dynamic value (customer shipping address, email, product names)
// before it goes into an email's HTML, so a crafted value can't inject markup.
const esc = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:600px){
    .vl-wrap{padding:20px 10px!important;}
    .vl-card{border-radius:12px!important;}
    .vl-head{padding:26px 22px!important;}
    .vl-body{padding:26px 22px!important;}
    .vl-foot{padding:18px 22px!important;}
  }
</style>
</head>
<body class="vl-wrap" style="margin:0;padding:40px 20px;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div class="vl-card" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div class="vl-head" style="background:#0f1a2e;padding:32px 40px;text-align:center;">
      <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Vitum Lab</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:2.5px;text-transform:uppercase;">Research Peptides · Est. 2024</p>
    </div>
    <div class="vl-body" style="padding:40px;">
${content}
      <div style="border-top:1px solid #eee;padding-top:24px;margin-top:28px;">
        <p style="margin:0 0 6px;font-size:13px;color:#888;">Questions about your order?</p>
        <a href="mailto:hello@vitumlab.com" style="color:#2c5fdb;font-size:14px;font-weight:600;text-decoration:none;">hello@vitumlab.com</a>
      </div>
    </div>
    <div class="vl-foot" style="background:#f7f8fa;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
        All products are for in vitro / laboratory research use only — not for human or veterinary consumption.<br>
        © ${new Date().getFullYear()} Vitum Lab
      </p>
    </div>
  </div>
</body>
</html>`;
}

function pill(text: string, bg: string, color: string): string {
  return `<div style="display:inline-block;background:${bg};border-radius:8px;padding:6px 14px;margin-bottom:20px;">
        <span style="color:${color};font-size:13px;font-weight:700;">${text}</span>
      </div>`;
}

function heading(title: string, body: string): string {
  return `<h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#0f1a2e;line-height:1.2;">${title}</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.65;">${body}</p>`;
}

function orderBox(order: EmailOrder, images?: Record<string, string>): string {
  const items = order.items ?? [];
  const rows = items.map((it) => {
    const img = images?.[it.cartCode];
    const thumb = img
      ? `<img src="${img}" width="40" height="40" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;display:block;" />`
      : `<div style="width:40px;height:40px;border-radius:8px;background:#eef0f3;"></div>`;
    return `
          <tr>
            <td style="padding:8px 12px 8px 0;vertical-align:middle;">${thumb}</td>
            <td style="padding:8px 0;font-size:14px;color:#333;vertical-align:middle;word-break:break-word;">${esc(it.name)} ${esc(it.dose)} <span style="color:#999;">× ${it.quantity}</span></td>
            <td style="padding:8px 0;font-size:14px;color:#333;text-align:right;vertical-align:middle;white-space:nowrap;">${it.price === 0 ? "Free" : money(it.price * it.quantity)}</td>
          </tr>`;
  }).join("");
  const discount = Number(order.discount_amount) > 0
    ? `<tr>
            <td></td>
            <td style="padding:6px 0;font-size:14px;color:#1a7a4a;word-break:break-word;">Discount${order.discount_code ? ` (${esc(order.discount_code)})` : ""}</td>
            <td style="padding:6px 0;font-size:14px;color:#1a7a4a;text-align:right;white-space:nowrap;">−${money(order.discount_amount)}</td>
          </tr>` : "";
  const shippingRow = Number(order.shipping_amount) > 0
    ? `<tr>
            <td></td>
            <td style="padding:6px 0;font-size:14px;color:#333;word-break:break-word;">Shipping</td>
            <td style="padding:6px 0;font-size:14px;color:#333;text-align:right;white-space:nowrap;">${money(order.shipping_amount)}</td>
          </tr>` : "";
  const creditRow = Number(order.credit_applied) > 0
    ? `<tr>
            <td></td>
            <td style="padding:6px 0;font-size:14px;color:#1a7a4a;word-break:break-word;">Store credit</td>
            <td style="padding:6px 0;font-size:14px;color:#1a7a4a;text-align:right;white-space:nowrap;">−${money(order.credit_applied)}</td>
          </tr>` : "";
  return `<div style="background:#f7f8fa;border-radius:10px;padding:18px;margin-bottom:24px;">
        <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Order <span style="font-family:monospace;color:#555;">${formatOrderId(order.id)}</span></p>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup><col style="width:52px;"><col><col style="width:84px;"></colgroup>${rows}${discount}${shippingRow}${creditRow}
          <tr>
            <td></td>
            <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#0f1a2e;border-top:1px solid #e5e7eb;">Total</td>
            <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#0f1a2e;text-align:right;border-top:1px solid #e5e7eb;white-space:nowrap;">${money(orderTotal(order))}</td>
          </tr>
        </table>
      </div>`;
}

function addressBox(a?: EmailAddress | null): string {
  if (!a?.line1) return "";
  const lines = [a.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? ` ${a.postal_code}` : ""), a.country]
    .filter((l) => l && String(l).trim())
    .map((l) => esc(String(l)));
  return `<div style="margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;">Ships to</p>
        <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">${lines.join("<br>")}</p>
      </div>`;
}

function button(label: string, url: string): string {
  return `<div style="margin:0 0 28px;">
        <a href="${url}" style="display:inline-block;background:#0f1a2e;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:10px;">${label}</a>
      </div>`;
}

/** Carrier-aware tracking link. USPS is the default (USPS-only shop). */
export function trackingUrl(carrier: string | null | undefined, tracking: string): string {
  const c = (carrier || "usps").toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
}

// ─── Per-event content ───────────────────────────────────────────────────────
function buildOrderEmail(order: EmailOrder, event: OrderEmailEvent, opts?: { invoiceUrl?: string; wasPending?: boolean; manual?: { label: string; handle: string; instructions: string } }, images?: Record<string, string>): { to: string; subject: string; html: string } {
  const shortId = formatOrderId(order.id);

  switch (event) {
    case "order_created":
      if (opts?.manual) {
        // Manual peer-to-peer transfer — include exactly where to send + the
        // order number to put in the memo so we can match the payment.
        const m = opts.manual;
        const memoBox =
          `<div style="background:#f0f9ff;border:1px solid #bae0f5;border-radius:10px;padding:16px;margin:0 0 20px;">` +
          `<p style="margin:0 0 8px;font-size:13px;color:#2b5a72;">Send <strong>${money(orderTotal(order))}</strong> via <strong>${esc(m.label)}</strong> to:</p>` +
          `<p style="margin:0 0 8px;font-size:18px;font-weight:700;font-family:monospace;color:#0b3d54;word-break:break-all;">${esc(m.handle)}</p>` +
          (m.instructions ? `<p style="margin:0 0 8px;font-size:12px;color:#3a6b82;white-space:pre-line;">${esc(m.instructions)}</p>` : "") +
          `<p style="margin:8px 0 0;font-size:12px;color:#3a6b82;border-top:1px solid #cfe6f2;padding-top:8px;">⚠️ Put your order number <strong style="font-family:monospace;">${esc(formatOrderId(order.id))}</strong> in the payment memo so we can match it. We ship as soon as it's received.</p>` +
          `</div>`;
        return {
          to: order.email,
          subject: `Order received — send your ${m.label} payment (${shortId})`,
          html: layout(
            pill("Awaiting Payment", "#fdf6e7", "#9a6b15") +
            heading("We've received your order", `Your order is reserved. Complete your payment via ${esc(m.label)} using the details below and we'll confirm and ship as soon as it arrives.`) +
            memoBox +
            orderBox(order, images) + addressBox(order.shipping_address),
          ),
        };
      }
      return {
        to: order.email,
        subject: `Order received — complete your payment (${shortId})`,
        html: layout(
          pill("Order Received", "#fdf6e7", "#9a6b15") +
          heading("We've received your order", "Your order has been created and is awaiting payment. Complete checkout within 24 hours — unpaid orders are automatically cancelled after that.") +
          (opts?.invoiceUrl ? button("Complete Payment", opts.invoiceUrl) : "") +
          orderBox(order, images) + addressBox(order.shipping_address),
        ),
      };
    case "confirmed":
      return {
        to: order.email,
        subject: `Order confirmed — ${shortId}`,
        html: layout(
          pill("✓ Payment Confirmed", "#edfaf3", "#1a7a4a") +
          heading("Your order is confirmed", "Thank you for your Vitum Lab order. Your payment has been confirmed and your order is now being processed for shipment.") +
          orderBox(order, images) + addressBox(order.shipping_address) +
          `<p style="margin:0 0 4px;font-size:14px;color:#666;line-height:1.65;">You'll receive tracking information once your order ships. East Coast orders typically arrive in 2 days; Central and West Coast orders in 3 days via USPS Priority Mail.</p>`,
        ),
      };
    case "shipped": {
      const track = order.tracking_number ? trackingUrl(order.carrier, order.tracking_number) : `${baseUrl()}/account`;
      return {
        to: order.email,
        subject: `Your order has shipped — ${shortId}`,
        html: layout(
          pill("📦 Shipped", "#eaf1fd", "#2c5fdb") +
          heading("Your order is on the way", `Your order shipped via ${esc(order.carrier || "USPS")}${order.tracking_number ? ` — tracking number <span style="font-family:monospace;font-weight:700;color:#0f1a2e;">${esc(order.tracking_number)}</span>` : ""}. East Coast orders typically arrive in 2 days; Central and West Coast in 3 days.`) +
          button("Track Your Package", track) +
          orderBox(order, images) + addressBox(order.shipping_address),
        ),
      };
    }
    case "delivered":
      return {
        to: order.email,
        subject: `Delivered — ${shortId}`,
        html: layout(
          pill("✓ Delivered", "#edfaf3", "#1a7a4a") +
          heading("Your order has been delivered", "Thanks for choosing Vitum Lab. Certificates of analysis for every lot are available in our COA library.") +
          button("View COA Library", `${baseUrl()}/coa-library`) +
          orderBox(order, images),
        ),
      };
    case "cancelled":
      return {
        to: order.email,
        subject: `Order cancelled — ${shortId}`,
        html: layout(
          pill("Order Cancelled", "#f4f4f5", "#52525b") +
          heading("Your order was cancelled", `${order.cancel_reason ? `Reason: ${esc(order.cancel_reason)}.` : ""} ${opts?.wasPending !== false ? "No payment was collected for this order." : "If you believe this is a mistake, reply to this email and we'll make it right."}`) +
          orderBox(order, images) +
          button("Place a New Order", `${baseUrl()}/shop`),
        ),
      };
    case "failed":
      return {
        to: order.email,
        subject: `Payment didn't go through — ${shortId}`,
        html: layout(
          pill("Payment Failed", "#fdecec", "#c0392b") +
          heading("Your payment didn't complete", "The payment for your order failed or expired, so the order was not processed and you have not been charged. You can place the order again any time.") +
          orderBox(order, images) +
          button("Try Again", `${baseUrl()}/shop`),
        ),
      };
    case "admin_new_order": {
      const a = order.shipping_address;
      const shipTo = a?.line1 ? `${esc(a.name ?? "")}, ${esc(a.line1)}${a.line2 ? ` ${esc(a.line2)}` : ""}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}` : "no address on file";
      return {
        to: ordersInbox(),
        subject: `💰 New paid order ${money(orderTotal(order))} — ${shortId}`,
        html: layout(
          pill("New Paid Order", "#edfaf3", "#1a7a4a") +
          heading(`${money(orderTotal(order))} — ready to fulfill`, `Customer: ${esc(order.email)}<br>Ship to: ${shipTo}`) +
          orderBox(order, images) +
          button("Open Admin → Orders", `${baseUrl()}/admin`),
        ),
      };
    }
    case "admin_delivered": {
      const a = order.shipping_address;
      const shipTo = a?.line1 ? `${esc(a.name ?? "")}, ${esc(a.line1)}${a.line2 ? ` ${esc(a.line2)}` : ""}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.postal_code)}` : "no address on file";
      return {
        to: deliveredInbox(),
        subject: `📬 Delivered — ${shortId} (${order.email})`,
        html: layout(
          pill("Order Delivered", "#edfaf3", "#1a7a4a") +
          heading(`Order ${shortId} was delivered`, `Customer: ${esc(order.email)}<br>${order.tracking_number ? `Tracking: ${esc(order.carrier || "USPS")} ${esc(order.tracking_number)}<br>` : ""}Ship to: ${shipTo}`) +
          orderBox(order, images) +
          button("Open Admin → Orders", `${baseUrl()}/admin`),
        ),
      };
    }
    case "admin_late_payment":
      return {
        to: ordersInbox(),
        subject: `⚠️ Late payment on ${order.status ?? "cancelled"} order — ${shortId}`,
        html: layout(
          pill("Late Payment — Action Needed", "#fdf3e7", "#b9770e") +
          heading(
            "Payment received on a dead order",
            `The customer paid AFTER order ${shortId} was ${esc(order.status ?? "cancelled")}, so it was <strong>not fulfilled</strong>: stock was not decremented and no confirmation email was sent. Refund ${esc(order.email)} or fulfill the order manually.`,
          ) +
          orderBox(order, images) +
          button("Open Admin → Orders", `${baseUrl()}/admin`),
        ),
      };
    case "followup":
      return {
        to: order.email,
        subject: "How's your Vitum Lab order?",
        html: layout(
          pill("Thanks Again", "#eaf1fd", "#2c5fdb") +
          heading("How did everything go?", "It's been a little while since your order was delivered. If everything arrived in great shape, we'd love to have you back — and certificates of analysis for every lot are always in our COA library.") +
          button("Reorder", `${baseUrl()}/shop`) +
          orderBox(order, images) +
          `<p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">You're receiving this one-time follow-up because you placed an order with us. Reply with "stop" and we won't send another.</p>`,
        ),
      };
  }
}

/**
 * Send an order lifecycle email exactly once (per orders.emails_sent), unless
 * force is set (admin resend). Returns true if a send actually happened.
 */
const MANUAL_EMAIL_METHODS: Record<string, string> = { zelle: "Zelle", cashapp: "Cash App", venmo: "Venmo", ach: "bank transfer" };

// Look up a manual method's send-to handle so the "order received" email can
// include the payment details (the customer may have left the success page).
async function manualHandle(method: string): Promise<{ label: string; handle: string; instructions: string } | null> {
  const { data } = await supabaseAdmin.from("store_settings").select("payment_config").maybeSingle();
  const m = (data?.payment_config as Record<string, { handle?: string; instructions?: string }> | null)?.[method];
  if (m?.handle) return { label: MANUAL_EMAIL_METHODS[method] ?? method, handle: String(m.handle), instructions: String(m.instructions ?? "") };
  return null;
}

export async function sendOrderEvent(
  order: EmailOrder,
  event: OrderEmailEvent,
  opts?: { force?: boolean; invoiceUrl?: string; wasPending?: boolean },
): Promise<boolean> {
  if (!opts?.force && order.emails_sent?.[event]) return false;
  if (!order.email) return false;
  const images = await productImageMap().catch(() => ({}));
  // Manual-transfer "order received" email carries the send-to instructions.
  let manual: { label: string; handle: string; instructions: string } | undefined;
  if (event === "order_created" && order.payment_method && order.payment_method in MANUAL_EMAIL_METHODS) {
    manual = (await manualHandle(order.payment_method).catch(() => null)) ?? undefined;
  }
  const { to, subject, html } = buildOrderEmail(order, event, { ...opts, manual }, images);
  await send(to, subject, html);
  await stampEmail(order.id, event);
  return true;
}

// ─── Welcome (not order-scoped; deduped via auth user metadata by caller) ────
export async function sendWelcome(to: string) {
  await send(
    to,
    "Welcome to Vitum Lab",
    layout(
      pill("Welcome", "#eaf1fd", "#2c5fdb") +
      heading("Your account is ready", "Thanks for creating a Vitum Lab account. You can view your order history and live shipping status any time, and every lot we sell has a published certificate of analysis.") +
      button("Browse Products", `${baseUrl()}/shop`) +
      `<p style="margin:0;font-size:14px;color:#666;line-height:1.65;">Order updates — payment, shipping, and delivery — will arrive at this address automatically.</p>`,
    ),
  );
}

// ─── Back-in-stock (waitlist) ─────────────────────────────────────────────────
const inventoryInbox = () => process.env.INVENTORY_EMAIL || process.env.GMAIL_USER!;

export async function sendBackInStock(to: string, opts: { name: string; url: string; image?: string }) {
  const thumb = opts.image
    ? `<div style="margin:0 0 20px;"><img src="${absoluteUrl(opts.image)}" width="72" height="72" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:12px;border:1px solid #e5e7eb;" /></div>`
    : "";
  await send(
    to,
    `Back in stock: ${opts.name}`,
    layout(
      pill("Back in Stock", "#edfaf3", "#1a7a4a") +
      heading(`${opts.name} is back in stock`, "The item you asked about is available again. Quantities can be limited, so order soon to secure yours.") +
      thumb +
      button("Shop Now", opts.url) +
      `<p style="margin:0;font-size:13px;color:#888;line-height:1.6;">You're receiving this because you asked to be notified when this item returned. No further emails about it will be sent.</p>`,
    ),
  );
}

// ─── Affiliate: per-order commission notification (order-scoped idempotency) ──
export async function sendAffiliateCommission(
  order: EmailOrder,
  affiliate: { email: string; code: string; commission: number },
): Promise<boolean> {
  if (order.emails_sent?.["affiliate_commission"]) return false;
  if (!affiliate.email || affiliate.commission <= 0) return false;
  await send(
    affiliate.email,
    `You earned ${money(affiliate.commission)} in commission`,
    layout(
      pill("Commission Earned", "#edfaf3", "#1a7a4a") +
      heading(`You earned ${money(affiliate.commission)}`, `A customer just completed an order using your code <b>${affiliate.code}</b>. Your commission on order ${formatOrderId(order.id)} is <b>${money(affiliate.commission)}</b>.`) +
      button("Open Affiliate Dashboard", `${baseUrl()}/affiliate/dashboard`),
    ),
  );
  await stampEmail(order.id, "affiliate_commission");
  return true;
}

// ─── Affiliate: monthly statement (via cron, 1st of the month) ───────────────
export async function sendAffiliateStatement(
  to: string,
  s: { code: string; monthLabel: string; orders: number; commission: number; paidOut: number; owed: number },
) {
  if (!to) return;
  const row = (label: string, value: string, color = "#0f1a2e") =>
    `<tr><td style="padding:7px 0;font-size:14px;color:#555;">${label}</td><td style="padding:7px 0;font-size:14px;font-weight:700;text-align:right;color:${color};">${value}</td></tr>`;
  await send(
    to,
    `Your ${s.monthLabel} affiliate statement`,
    layout(
      pill("Monthly Statement", "#eaf1fd", "#2c5fdb") +
      heading(`${s.monthLabel} summary`, `Here's how your code <b>${s.code}</b> performed last month.`) +
      `<div style="background:#f7f8fa;border-radius:10px;padding:16px 20px;margin-bottom:24px;"><table style="width:100%;border-collapse:collapse;">
        ${row("Orders", String(s.orders))}
        ${row("Commission earned", money(s.commission), "#1a7a4a")}
        ${row("Paid out to date", money(s.paidOut))}
        ${row("Balance owed", money(s.owed), "#9a6b15")}
      </table></div>` +
      button("Open Affiliate Dashboard", `${baseUrl()}/affiliate/dashboard`),
    ),
  );
}

// ─── Low-stock digest (admin, via cron) ──────────────────────────────────────
export async function sendLowStockDigest(rows: { cartCode: string; stock: number }[]) {
  if (rows.length === 0) return;
  const list = rows
    .map((r) => `
          <tr>
            <td style="padding:7px 0;font-family:monospace;font-size:13px;color:#333;">${r.cartCode}</td>
            <td style="padding:7px 0;font-size:13px;font-weight:700;text-align:right;color:${r.stock === 0 ? "#c0392b" : "#9a6b15"};">${r.stock === 0 ? "OUT OF STOCK" : `${r.stock} left`}</td>
          </tr>`)
    .join("");
  await send(
    inventoryInbox(),
    `Low stock — ${rows.length} item${rows.length === 1 ? "" : "s"} need attention`,
    layout(
      pill("Inventory", "#fdf6e7", "#9a6b15") +
      heading("Low / out-of-stock items", "These products are at or below the low-stock threshold (5 units). Restock to keep them sellable.") +
      `<div style="background:#f7f8fa;border-radius:10px;padding:16px 20px;margin-bottom:24px;"><table style="width:100%;border-collapse:collapse;">${list}</table></div>` +
      button("Open Admin → Inventory", `${baseUrl()}/admin`),
    ),
  );
}

