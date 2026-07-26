# Design — Paraná Info ("Almanaque del Paraná")

A locked design system for the rioparana.com.ar landing. Every page reads this
file before emitting code. Do not regenerate per page — extend or amend this
file when the system needs to grow.

Brand-anchored editorial redesign: keeps the river-blue / warm-sand / vegetation
identity, replaces the templated gradient-hero + card-grid structure with a
field-guide / almanac reading rhythm built on hairline rules and typography.

## Genre
editorial

## Macrostructure family
Single family across the whole site — consistency is the goal.

- Marketing (home `index.html`): **Long Document / almanac** — masthead, a
  document rhythm of hairline-ruled entries; the Leaflet map is the full-bleed
  centrepiece; guides / stations / sources read as almanac directories.
- Content (`guias/*.html`, `privacy-policy.html`): **Long Document** — breadcrumb,
  prose measure ≤ 66ch, facts as a definition grid, FAQ as hairline `<details>`.

Variation between pages lives in section archetypes, never in theme/type/colour.

## Theme (brand-anchored, values in tokens.css)
- `--color-paper`   oklch(96% 0.010 90)   warm off-white
- `--color-ink`     oklch(24% 0.020 62)   warm brown-black
- `--color-ink-2`   oklch(43% 0.022 60)   body
- `--color-rule`    oklch(80% 0.020 78)   hairline taupe
- `--color-accent`  oklch(46% 0.058 233)  river blue — single accent, ≤ 5%/viewport
- `--color-veg`     oklch(52% 0.098 143)  vegetation green — utility only
- `--color-focus`   oklch(46% 0.110 233)
- Dark mode: river-night ground, preserved via prefers-color-scheme + `[data-theme]`.

## Typography
- Display: Fraunces, weight 600–900, style normal (roman — no italic headers)
- Body:    Newsreader, weight 400–500
- Mono:    IBM Plex Mono, weight 400–600 — for DATA only (coords, levels, station names)
- Display tracking: -0.012em · Label tracking: 0.14em
- Type scale anchor: `--text-display` = clamp(2.6rem, 6.2vw, 5rem)

## Spacing
4-point named scale in tokens.css. Pages use named tokens (`var(--space-md)`),
never raw values.

## Motion
- Easing: `--ease-out` cubic-bezier(0.16, 1, 0.3, 1)
- Reveal pattern: single quiet fade-up on scroll (`.reveal`), one orchestrated pass
- Reduced-motion: opacity-only, ≤ 150ms — spatial transforms removed

## Microinteractions stance
- Silent success · no celebratory toasts
- Hover tooltips 800ms · focus 0ms
- Links: drawn underline that thickens on hover — never a colour-only swap
- Focus ring shows instantly, never animated

## CTA voice
- Primary: solid river-blue fill, `--radius-btn` 4px (NOT a pill, NOT gradient),
  weight 700, label is a verb ("Explorar el mapa", "Contactar por WhatsApp")
- Secondary: hairline-outlined, same radius, ink text
- WhatsApp CTAs keep the platform green (external convention) — the only non-accent fill

## Per-page allowances
- Home MAY use Tier-A CSS/SVG enrichment (the hairline river rule); keeps the real
  Leaflet map + real app screenshots.
- Content pages: typography only, no enrichment.

## What pages MUST share
- Wordmark "Paraná Info" masthead + "Río Paraná · Argentina" issue line
- Accent river-blue and its ≤ 5% placement
- Fraunces + Newsreader + IBM Plex Mono
- CTA voice (4px radius, roman verbs, no pills/gradients)
- Section heading rhythm: hairline rule + small-caps mono label + Fraunces display heading
  (label ABOVE heading, stacked — never a left-margin two-column label)

## What pages MAY differ on
- Section archetypes within the Long Document family
- Presence of the map / directory blocks (home only)

## Preservation contract (redesign — do NOT touch)
- The Leaflet map div, its layer toggles, and all `<script>` (map init + GeoJSON)
- Embedded base64 assets (app icon, phone screenshots)
- `analytics.js` include, JSON-LD structured data, meta/canonical/OG tags
- All copy, all section anchors (`#mapa` `#guias` `#app`), all outbound links

## Exports

### tokens.css
Canonical token file at the project root. Pages import `/tokens.css` then `/site.css`.
See tokens.css for the full `--color-*`, `--font-*`, `--space-*`, `--text-*`,
`--ease-*`, `--radius-*`, `--rule-*` set (light + dark).
