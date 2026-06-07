# Vitum Lab — Design Direction Brainstorm

<response>
<probability>0.07</probability>
<text>
<idea>
**Design Movement**: Swiss International Typographic Style meets Clinical Modernism

**Core Principles**:
1. Information hierarchy through typographic scale — no decorative elements, only structure
2. Asymmetric grid with deliberate tension between text columns and imagery
3. Monochromatic navy/white palette interrupted only by precise cobalt accents
4. Every element earns its place through function, not decoration

**Color Philosophy**: Deep navy (#0A1628) as the dominant authority color — it reads as institutional, trustworthy, and precise. White (#FFFFFF) as the canvas. Cobalt (#1B4FD8) as the single accent that signals action and verification. Silver (#94A3B8) for secondary metadata. No gradients, no soft pastels — this is a research lab, not a wellness brand.

**Layout Paradigm**: Left-anchored asymmetric layout. Navigation and headlines hug the left edge. Product imagery bleeds to the right. Content columns use a strict 12-column grid with intentional negative space. Sections separated by thin 1px rules rather than background color changes.

**Signature Elements**:
1. Thin horizontal rule with a small diamond separator — used between sections
2. Monospaced batch/lot numbers in a subtle code-style font (like a lab report)
3. COA verification badges styled as official stamps with a thin border and checkmark

**Interaction Philosophy**: Interactions are precise and immediate. No bouncy animations. Hover states reveal additional data (batch info, purity %) rather than changing colors. Clicks feel like pressing a lab instrument button — instant, confirmed.

**Animation**: Fade-in on scroll (opacity 0→1, translateY 8px→0, 200ms ease-out). No parallax. No floating elements. Section entrances stagger at 40ms intervals. Button press: scale(0.97) at 120ms.

**Typography System**: 
- Display: DM Sans 700 (headlines, product names)
- Body: DM Sans 400 (descriptions, metadata)
- Mono: JetBrains Mono 400 (batch numbers, COA codes, technical specs)
- Scale: 48px hero → 32px section → 20px card → 16px body → 12px metadata
</idea>
</text>
</response>

<response>
<probability>0.05</probability>
<text>
<idea>
**Design Movement**: Bauhaus Functionalism meets Pharmaceutical Precision

**Core Principles**:
1. Form follows function — every visual element serves a compliance or trust purpose
2. Strong geometric structure with deliberate use of negative space as a design element
3. Clinical white dominates; navy appears only where authority is needed
4. Typography does the heavy lifting — no stock photography, no decorative imagery

**Color Philosophy**: Pure white (#FFFFFF) background as a sterile field. Deep navy (#0F1F3D) for primary text and structural elements — evokes lab coats and institutional trust. A single electric cobalt (#2563EB) for CTAs and verification marks. Warm silver (#CBD5E1) for borders and dividers. The palette reads like a pharmaceutical insert — authoritative, not aspirational.

**Layout Paradigm**: Modular card grid with strict proportional relationships. Hero section uses a 60/40 split — text block left, floating vial imagery right. Product cards are perfectly square with consistent padding. No organic shapes, no diagonal cuts.

**Signature Elements**:
1. Thin navy border on left edge of section headers (4px accent bar)
2. "VERIFIED" stamp overlay on product cards — circular badge with checkmark
3. Monospaced COA reference numbers displayed like lab specimen IDs

**Interaction Philosophy**: Precision over delight. Hover reveals a data overlay with purity percentage and batch date. Add to cart is a two-step confirmation. Age gate uses a formal declaration format.

**Animation**: Minimal. Section reveals use a 150ms opacity fade only. No transforms. Accordion opens at 200ms ease-out. The UI should feel like a precision instrument, not a consumer app.

**Typography System**:
- Display: Space Grotesk 700 (headlines)
- Body: Space Grotesk 400 (body text)
- Mono: Space Mono 400 (technical data, batch numbers)
- Hierarchy: tight letter-spacing on uppercase labels, generous line-height on body
</idea>
</text>
</response>

<response>
<probability>0.08</probability>
<text>
<idea>
**Design Movement**: Contemporary Clinical — Med Spa Precision with Research Credibility

**Core Principles**:
1. Generous whitespace as a trust signal — cluttered sites feel untrustworthy
2. Navy-anchored color system with silver as a sophisticated secondary
3. Product photography as the primary visual element — vials as hero objects
4. Compliance and trust signals integrated into the design, not appended as afterthoughts

**Color Philosophy**: White (#FFFFFF) as the primary canvas — clean, sterile, trustworthy. Deep navy (#0A1628) as the brand anchor — institutional authority without being cold. Cobalt blue (#1E3A8A) for interactive elements and primary CTAs. Silver-grey (#64748B) for metadata, secondary text, and borders. The palette deliberately avoids warm tones — this is precision science, not wellness.

**Layout Paradigm**: Full-width sections with contained content columns (max 1280px). Hero uses a left-text / right-image split with the image bleeding to the viewport edge. Product grid is 3-column on desktop, 2 on tablet, 1 on mobile. Trust badges run in a horizontal strip between hero and products.

**Signature Elements**:
1. Thin cobalt underline on active navigation items and section labels
2. "Research Use Only" disclaimer styled as a formal notice box with a left border accent
3. COA download buttons styled as document icons with a navy border

**Interaction Philosophy**: Clean, confident, direct. CTAs are clear and prominent. Trust signals are always visible. The age gate is formal and unambiguous. Checkout is a single path via NowPayments (crypto or card/Apple Pay through the fiat on-ramp).

**Animation**: Subtle entrance animations on scroll (translateY 16px → 0, opacity 0 → 1, 250ms cubic-bezier(0.23, 1, 0.32, 1)). Stagger product cards at 60ms. Button hover: slight background darkening at 150ms. No parallax, no heavy motion.

**Typography System**:
- Display: Sora 700 (hero headlines, product names)
- Body: Sora 400/500 (descriptions, navigation, UI)
- Mono: IBM Plex Mono 400 (batch numbers, COA codes)
- Uppercase tracking on category labels and trust badges
</idea>
</text>
</response>

---

## Selected Direction: Response 3 — Contemporary Clinical

**Rationale**: This approach best serves the brand brief — "clinical, precise, trustworthy, research lab tone, not supplement bro." The generous whitespace signals professionalism, the navy/cobalt/silver palette is authoritative without being cold, and the layout structure mirrors the information architecture requested (hero → trust badges → products → about → newsletter → footer). The Sora typeface is distinctive without being decorative, and the compliance elements are treated as design features rather than legal footnotes.
