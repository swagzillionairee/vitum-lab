import LegalPage from "@/components/LegalPage";
import SEO from "@/components/SEO";

export default function ReturnPolicy() {
  return (
    <>
      <SEO
        title="Return Policy"
        description="Vitum Lab return policy: eligible returns, refund processing, damaged items, and contact information."
      />
      <LegalPage title="Return Policy" lastUpdated="May 2025">
        <h2>Lost in Transit</h2>
        <p>
          If a package is confirmed lost by USPS tracking, we will ship a replacement at no charge.
          Please contact us within <strong>14 days of the expected delivery date</strong> with your
          order number so we can open a trace and arrange a replacement shipment.
        </p>

        <h2>Opened Products</h2>
        <p>
          Once a vial's plastic cap has been removed, the product is <strong>no longer eligible
          for return or replacement</strong>. Due to the research-grade nature of our compounds and
          sterility concerns, we are unable to accept or restock any product that has been opened or
          used.
        </p>

        <h2>Return Shipping</h2>
        <p>
          Return shipping costs are the buyer's responsibility. We strongly recommend using a tracked
          shipping method, as we are not responsible for packages lost during return transit. Vitum
          Lab will not issue a refund for items that are not received.
        </p>

        <h2>Eligible Returns</h2>
        <p>
          Unopened, sealed products may be returned within <strong>14 days of delivery</strong>.
          Please contact{" "}
          <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a> before sending anything back —
          you must receive a return authorization before shipping your item. Returns sent without
          prior authorization will not be accepted.
        </p>

        <h2>Refund Processing</h2>
        <p>
          Approved refunds are processed within <strong>5–7 business days</strong> of receiving
          the returned item. Refunds are issued to the original payment method. You will receive an
          email confirmation once the refund has been initiated.
        </p>

        <h2>Damaged on Arrival</h2>
        <p>
          If your order arrives visibly damaged, please photograph the packaging and product
          immediately and email{" "}
          <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a> within{" "}
          <strong>48 hours of delivery</strong>. Include your order number and photos of the damage.
          Claims submitted after this window may not be eligible for replacement or refund.
        </p>

        <h2>Contact</h2>
        <p>
          For return and refund questions, reach us at{" "}
          <a href="mailto:hello@vitumlab.com">hello@vitumlab.com</a>.
        </p>
      </LegalPage>
    </>
  );
}
