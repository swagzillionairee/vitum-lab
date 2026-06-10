/**
 * SEO.tsx — Vitum Lab
 * Lightweight head manager: title, meta description/keywords, Open Graph,
 * Twitter card, canonical, and optional JSON-LD structured data (for rich
 * results on searches like "retatrutide", "GHK-Cu", "research peptides").
 * No external dependency needed.
 */

import { useEffect } from "react";

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  image?: string;
  keywords?: string;
  ogType?: string;
  /** schema.org JSON-LD object (or array of objects) injected as a <script>. */
  jsonLd?: object | object[];
}

const SITE_NAME = "Vitum Lab";
const SITE_URL = "https://vitumlab.com";
const DEFAULT_IMAGE = `${SITE_URL}/vitum%20lab%20logo%20black.png`;
const DEFAULT_DESCRIPTION =
  "Vitum Lab — research-grade peptides: GLP-3 (R) / Retatrutide, GHK-Cu, NAD+, and BAC Water. ≥99% purity, third-party HPLC tested, COA with every order. For laboratory research use only.";
const DEFAULT_KEYWORDS =
  "retatrutide, GLP-3, research peptides, GHK-Cu, NAD+, BAC water, peptides for research, buy retatrutide, reconstitution, certificate of analysis";

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

export default function SEO({ title, description, canonical, image, keywords, ogType = "website", jsonLd }: SEOProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Research-Grade Peptides (Retatrutide, GHK-Cu, NAD+)`;
  const metaDesc = description ?? DEFAULT_DESCRIPTION;
  const url = canonical ?? (typeof window !== "undefined" ? window.location.href.split("?")[0] : SITE_URL);
  const img = image ?? DEFAULT_IMAGE;

  useEffect(() => {
    document.title = fullTitle;

    upsertMeta("name", "description", metaDesc);
    upsertMeta("name", "keywords", keywords ?? DEFAULT_KEYWORDS);

    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", metaDesc);
    upsertMeta("property", "og:type", ogType);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:image", img);
    upsertMeta("property", "og:site_name", SITE_NAME);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", metaDesc);
    upsertMeta("name", "twitter:image", img);

    // Canonical
    let canonicalTag = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalTag) {
      canonicalTag = document.createElement("link");
      canonicalTag.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalTag);
    }
    canonicalTag.setAttribute("href", url);

    // JSON-LD structured data (replaced per page; removed on unmount).
    const ID = "vl-jsonld";
    document.getElementById(ID)?.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = ID;
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
    return () => { document.getElementById(ID)?.remove(); };
  }, [fullTitle, metaDesc, keywords, url, img, ogType, jsonLd]);

  return null;
}
