import LegalPage from "@/components/LegalPage";
import SEO from "@/components/SEO";

export default function PrivacyPolicy() {
  return (
    <>
    <SEO title="Privacy Policy" description="Vitum Lab privacy policy — how we collect, use, and protect your personal information." />
    <LegalPage title="Privacy Policy" lastUpdated="May 2025">
      <h2>Overview</h2>
      <p>
        Vitum Lab ("we," "us," or "our") is committed to protecting your personal information. This Privacy Policy describes how we collect, use, and safeguard data when you visit <strong>vitumlab.com</strong> or place an order with us.
      </p>

      <h2>Information We Collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li><strong>Order information:</strong> name, shipping address, email address, and payment details (processed securely through our payment provider — we do not store full card numbers).</li>
        <li><strong>Account information:</strong> email address and password if you create an account.</li>
        <li><strong>Usage data:</strong> pages visited, browser type, IP address, and referring URLs collected automatically via analytics tools.</li>
        <li><strong>Communications:</strong> messages you send us via email or contact forms.</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Process and fulfill your orders and send order confirmations and shipping notifications.</li>
        <li>Respond to customer service inquiries.</li>
        <li>Send promotional emails if you have opted in (you may unsubscribe at any time).</li>
        <li>Improve our website, products, and services through analytics.</li>
        <li>Comply with legal obligations and enforce our terms.</li>
      </ul>

      <h2>Sharing of Information</h2>
      <p>
        We do not sell, rent, or trade your personal information to third parties. We may share data with trusted service providers (such as payment processors, shipping carriers, and analytics platforms) solely to operate our business. These providers are contractually obligated to protect your data and may not use it for their own purposes.
      </p>

      <h2>Cookies</h2>
      <p>
        Our website uses cookies and similar technologies to remember your preferences (such as age verification), maintain session state, and gather aggregate analytics. You may disable cookies in your browser settings, though some site features may not function correctly as a result.
      </p>

      <h2>Data Retention</h2>
      <p>
        We retain order and account data for as long as necessary to fulfill the purposes described in this policy and to comply with legal, tax, and accounting obligations. You may request deletion of your personal data at any time by contacting us.
      </p>

      <h2>Your Rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, or delete the personal data we hold about you, or to object to or restrict certain processing. To exercise these rights, please contact us at{" "}
        <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a>.
      </p>

      <h2>Security</h2>
      <p>
        We implement industry-standard security measures including SSL/TLS encryption for data in transit and secure storage practices. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
      </p>

      <h2>Children's Privacy</h2>
      <p>
        Our site is not directed to individuals under 21 years of age. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal data, please contact us immediately.
      </p>

      <h2>Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last updated" date. Continued use of the site after changes constitutes acceptance of the revised policy.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy-related questions or requests, contact us at{" "}
        <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a>.
      </p>
    </LegalPage>
  </>
  );
}