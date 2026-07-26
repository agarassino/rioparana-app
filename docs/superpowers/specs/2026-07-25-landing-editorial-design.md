# Landing editorial design migration

## Goal
Apply the existing "Almanaque del Paraná" design system to the landing while preserving all production content and DOM structure exactly.

## Scope
- Modify only visual presentation assets: `landing/tokens.css`, `landing/site.css`, and stylesheet references in landing HTML documents when required.
- Keep all existing text, links, IDs, anchors, element order, scripts, map initialization, data, metadata semantics, and page routes unchanged.
- Apply the shared styling to `landing/index.html`, the guide detail pages, and `landing/privacy-policy.html` without adding wrappers or changing page structure.

## Design system
- Warm paper surface, river-blue primary accent, restrained vegetation utility color.
- Fraunces display, Newsreader body, and IBM Plex Mono for data.
- Long-document rhythm: fine rules, vertical labels above headings, editorial reading measure.
- Full keyboard focus, dark-mode support, and reduced-motion support.

## Non-goals
- No copy editing or SEO/content changes.
- No information architecture or layout-structure changes.
- No changes to Leaflet behavior, analytics, JSON-LD, or outbound links.

## Verification
- Compare DOM-relevant content before and after: headings, links, section IDs, scripts, and map container must remain present and unchanged.
- Open the landing and guide pages at desktop and mobile widths; confirm maps, guide calls-to-action, and navigation still work.
- Check visual CSS syntax and existing automated checks relevant to the landing.
