import nodemailer from "nodemailer";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { name, email, subject, message } = req.body as {
    name: string;
    email: string;
    subject?: string;
    message: string;
  };

  if (!name || !email || !message) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Vitum Lab Contact Form" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER, // hello@vitumlab.com
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
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Contact email error:", err);
    res.status(500).json({ error: "Failed to send message. Please email us directly at hello@vitumlab.com." });
  }
}
