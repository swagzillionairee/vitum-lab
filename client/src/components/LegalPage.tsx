/**
 * LegalPage — shared layout wrapper for all legal/policy pages
 * Design: matches Vitum Lab oklch color system — dark navy header, white body
 */
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Full-width dark navy header */}
      <div
        style={{
          backgroundColor: "oklch(0.13 0.01 260)",
          paddingTop: "3.5rem",
          paddingBottom: "3.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "48rem",
            margin: "0 auto",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.8125rem",
              color: "oklch(0.65 0.01 260)",
              textDecoration: "none",
              marginBottom: "1.75rem",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.9)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLAnchorElement).style.color = "oklch(0.65 0.01 260)")
            }
          >
            <ArrowLeft style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }} />
            Back to Vitum Lab
          </Link>

          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "oklch(0.52 0.01 260)",
              marginBottom: "0.75rem",
            }}
          >
            Vitum Lab
          </p>

          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: "0.875rem",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>

          <span
            style={{
              display: "inline-block",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "oklch(0.52 0.01 260)",
              backgroundColor: "oklch(0.19 0.01 260)",
              border: "1px solid oklch(0.25 0.01 260)",
              borderRadius: "9999px",
              padding: "0.25rem 0.75rem",
            }}
          >
            Last updated: {lastUpdated}
          </span>
        </div>
      </div>

      {/* Body content */}
      <div
        style={{
          flex: 1,
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            maxWidth: "48rem",
            margin: "0 auto",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "3.5rem",
            paddingBottom: "3.5rem",
          }}
          className="legal-page-content"
        >
          {children}
        </div>
      </div>

      {/* Footer note */}
      <div
        style={{
          borderTop: "1px solid oklch(0.91 0.004 260)",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            maxWidth: "48rem",
            margin: "0 auto",
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "2rem",
            paddingBottom: "2rem",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "oklch(0.52 0.01 260)",
          }}
        >
          © {new Date().getFullYear()} Vitum Lab. All products are for research use only — not for
          human or veterinary use.
        </div>
      </div>

      {/* Scoped styles for child content rendered via JSX */}
      <style>{`
        .legal-page-content h2 {
          font-size: 1.0625rem;
          font-weight: 600;
          color: oklch(0.13 0.01 260);
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          padding-left: 0.875rem;
          border-left: 3px solid oklch(0.35 0.15 260);
          line-height: 1.35;
        }
        .legal-page-content h2:first-child {
          margin-top: 0;
        }
        .legal-page-content p {
          color: oklch(0.45 0.01 260);
          font-size: 0.9375rem;
          line-height: 1.75;
          margin-bottom: 1rem;
        }
        .legal-page-content strong {
          color: oklch(0.13 0.01 260);
          font-weight: 600;
        }
        .legal-page-content a {
          color: oklch(0.35 0.15 260);
          text-decoration: none;
        }
        .legal-page-content a:hover {
          text-decoration: underline;
        }
        .legal-page-content ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
          color: oklch(0.45 0.01 260);
        }
        .legal-page-content li {
          font-size: 0.9375rem;
          line-height: 1.75;
          margin-bottom: 0.25rem;
          color: oklch(0.45 0.01 260);
        }
        .legal-page-content li strong {
          color: oklch(0.13 0.01 260);
        }
      `}</style>
    </div>
  );
}
