import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function orderConfirmedHtml(orderId: string, amount: string, currency: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

    <div style="background:#0f1a2e;padding:32px 40px;text-align:center;">
      <p style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Vitum Lab</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.45);font-size:10px;letter-spacing:2.5px;text-transform:uppercase;">Research Peptides · Est. 2024</p>
    </div>

    <div style="padding:40px;">
      <div style="display:inline-block;background:#edfaf3;border-radius:8px;padding:6px 14px;margin-bottom:20px;">
        <span style="color:#1a7a4a;font-size:13px;font-weight:700;">✓ Payment Confirmed</span>
      </div>

      <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#0f1a2e;line-height:1.2;">Your order is confirmed</h1>
      <p style="margin:0 0 28px;font-size:15px;color:#555;line-height:1.65;">
        Thank you for your Vitum Lab order. Your crypto payment has been confirmed on the blockchain and your order is now being processed for shipment.
      </p>

      <div style="background:#f7f8fa;border-radius:10px;padding:20px 24px;margin-bottom:28px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;padding-bottom:6px;">Order Reference</td>
            <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#999;padding-bottom:6px;text-align:right;">Amount Paid</td>
          </tr>
          <tr>
            <td style="font-family:monospace;font-size:15px;font-weight:700;color:#0f1a2e;">${orderId}</td>
            <td style="font-size:15px;font-weight:700;color:#0f1a2e;text-align:right;">$${amount} USD</td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 28px;font-size:14px;color:#666;line-height:1.65;">
        You'll receive your tracking information once your order ships. Orders placed before 1pm EST typically ship the same day.
      </p>

      <div style="border-top:1px solid #eee;padding-top:24px;">
        <p style="margin:0 0 6px;font-size:13px;color:#888;">Questions about your order?</p>
        <a href="mailto:hello@vitumlab.com" style="color:#2c5fdb;font-size:14px;font-weight:600;text-decoration:none;">hello@vitumlab.com</a>
      </div>
    </div>

    <div style="background:#f7f8fa;border-top:1px solid #eee;padding:20px 40px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
        All products are for in vitro / laboratory research use only — not for human or veterinary consumption.<br>
        © ${new Date().getFullYear()} Vitum Lab
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendOrderConfirmation(
  toEmail: string,
  orderId: string,
  amount: string,
  currency: string
) {
  await transporter.sendMail({
    from: `"Vitum Lab" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Order confirmed — ${orderId}`,
    html: orderConfirmedHtml(orderId, amount, currency),
  });
}
