import LegalPage from "@/components/LegalPage";
import SEO from "@/components/SEO";

export default function ShippingPolicy() {
  return (
    <>
    <SEO title="Shipping & Returns" description="Vitum Lab shipping policy: same-day processing before 1pm EST, USPS Priority Mail, free shipping on orders over $150. US domestic only." />
    <LegalPage title="Shipping Policy" lastUpdated="May 2025">
      <h2>Shipping Method</h2>
      <p>
        All orders are shipped via <strong>USPS Priority Mail® Padded Flat Rate Envelope</strong>. This service typically delivers within 1–3 business days across the contiguous United States. Delivery times are estimates provided by USPS and are not guaranteed by Vitum Lab.
      </p>

      <h2>Same-Day Shipping Cutoff</h2>
      <p>
        Orders placed before <strong>1:00 PM Eastern Time (ET)</strong> on a business day are processed and shipped the same day. Orders placed after 1:00 PM ET, on weekends, or on federal holidays will be shipped on the next available business day.
      </p>

      <h2>Free Shipping Promotion</h2>
      <p>
        Orders totaling <strong>$150 or more</strong> qualify for free shipping. Orders below this threshold are subject to a flat shipping rate displayed at checkout. Free shipping applies to domestic U.S. orders only.
      </p>

      <h2>Complimentary BAC Water</h2>
      <p>
        Orders of $150 or more will automatically include a complimentary <strong>10mL Bacteriostatic Water (BAC Water)</strong> vial at no additional charge. This offer applies while supplies last and may be modified or discontinued at any time.
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