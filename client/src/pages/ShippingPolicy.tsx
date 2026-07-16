import LegalPage from "@/components/LegalPage";
import SEO from "@/components/SEO";

export default function ShippingPolicy() {
  return (
    <>
    <SEO title="Shipping & Returns" description="Vitum Lab shipping policy: USPS Ground Advantage padded envelopes, 2–5 business-day US delivery, free shipping on orders over $75." />
    <LegalPage title="Shipping Policy" lastUpdated="May 2025">
      <h2>Shipping Method</h2>
      <p>
        All orders are shipped via <strong>USPS Ground Advantage® in padded envelopes</strong>. Orders are processed and shipped on business days and weekends, excluding holidays and special circumstances.
      </p>

      <h2>Estimated Delivery Times</h2>
      <p>
        Delivery times are averages based on USPS Ground Advantage® transit times and are not guaranteed. Most orders arrive in 2–5 business days:
      </p>
      <ul>
        <li><strong>East Coast</strong> — approximately 2 business days</li>
        <li><strong>Central US</strong> — approximately 3–4 business days</li>
        <li><strong>West Coast</strong> — up to 5 business days (e.g. California)</li>
      </ul>
      <p>
        Delivery times are estimates provided by USPS and are not guaranteed by Vitum Lab. Delays may occur during peak periods or due to carrier circumstances outside our control.
      </p>

      <h2>Free Shipping Promotion</h2>
      <p>
        Orders totaling <strong>$75 or more</strong> qualify for free shipping. Orders below this threshold are subject to a flat <strong>$10</strong> shipping rate, displayed at checkout. The $75 threshold is determined by your item subtotal <strong>before any discount codes or store credit are applied</strong>, so a discount never affects your free-shipping eligibility. Free shipping applies to domestic U.S. orders only.
      </p>

      <h2>Complimentary BAC Water</h2>
      <p>
        Orders of $100 or more will automatically include a complimentary <strong>10mL Bacteriostatic Water (BAC Water)</strong> vial at no additional charge. This offer applies while supplies last and may be modified or discontinued at any time.
      </p>

      <h2>Product Stability During Transit</h2>
      <p>
        All Vitum Lab peptides are lyophilized (freeze-dried) and are stable at ambient temperature for the duration of standard domestic transit. Cold-chain shipping is not required for delivery. Upon receipt, products should be stored at <strong>2–8°C (36–46°F)</strong> in a sealed, dry environment away from direct light until use.
      </p>

      <h2>Domestic Shipping Only</h2>
      <p>
        At this time, Vitum Lab ships exclusively within the <strong>contiguous United States</strong>. We do not currently ship to Alaska, Hawaii, U.S. territories, or internationally. We hope to expand our shipping coverage in the future.
      </p>

      <h2>Order Tracking</h2>
      <p>
        A USPS tracking number will be emailed to you once your order has been shipped. You can track your package directly at{" "}
        <a href="https://tools.usps.com/go/TrackConfirmAction_input" target="_blank" rel="noopener noreferrer">
          usps.com
        </a>.
      </p>

      <h2>Undeliverable Packages</h2>
      <p>
        If a package is returned to us due to an incorrect or incomplete address provided by the customer, the customer is responsible for any re-shipping costs. Please double-check your shipping address before submitting your order.
      </p>

      <h2>Lost or Damaged Shipments</h2>
      <p>
        If your order arrives damaged or does not arrive within the expected timeframe, please contact us at{" "}
        <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a> within <strong>7 days of the expected delivery date</strong>. Include your order number and, where applicable, photos of the damaged packaging. We will work with you to resolve the issue promptly.
      </p>

      <h2>Contact</h2>
      <p>
        For shipping-related questions, reach us at{" "}
        <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a>.
      </p>
    </LegalPage>
  </>
  );
}