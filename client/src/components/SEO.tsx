/**
 * SEO.tsx — Vitum Lab
 * Lightweight head manager using document.title + meta tags.
 * No external dependency needed for a static site.
 */

import { useEffect } from "react";

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
}

const SITE_NAME = "Vitum Lab";
const DEFAULT_DESCRIPTION =
  "Vitum Lab — Research grade peptides including GLP-3 (R), GHK-Cu, and NAD+. ≥99% purity, third-party tested, COA with every order. For research use only.";

export default function SEO({ title, description, canonical }: SEOProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — Research Grade Peptides`;
  const metaDesc = description ?? DEFAULT_DESCRIPTION;

  useEffect(() => {
    // Title
    document.title = fullTitle;

    // Description
    let descTag = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]'
    );
    if (!descTag) {
      descTag = document.createElement("meta");
      descTag.setAttribute("name", "description");
      document.head.appendChild(descTag);
    }
    descTag.setAttribute("content", metaDesc);

    // OG title
    let ogTitle = document.querySelector<HTMLMetaElement>(
      'meta[property="og:title"]'
    );
    if (!ogTitle) {
      ogTitle = document.createElement("meta");
      ogTitle.setAttribute("property", "og:title");
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute("content", fullTitle);

    // OG description
    let ogDesc = document.querySelector<HTMLMetaElement>(
      'meta[property="og:description"]'
    );
    if (!ogDesc) {
      ogDesc = document.createElement("meta");
      ogDesc.setAttribute("property", "og:description");
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute("content", metaDesc);

    // Canonical
    if (canonical) {
      let canonicalTag = document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]'
      );
      if (!canonicalTag) {
        canonicalTag = document.createElement("link");
        canonicalTag.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalTag);
      }
      canonicalTag.setAttribute("href", canonical);
    }
  }, [fullTitle, metaDesc, canonical]);

  return null;
}
