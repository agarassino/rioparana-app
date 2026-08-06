# Landing Editorial Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Almanaque del Paraná visual system to all landing pages while leaving their content and DOM structure intact.

**Architecture:** The landing continues to own its existing static HTML and scripts. `landing/tokens.css` defines the shared visual vocabulary and `landing/site.css` applies it to the existing selectors; each guide and the privacy page loads those two files. No JavaScript, map configuration, copy, links, IDs, or element ordering changes are permitted.

**Tech Stack:** Static HTML, CSS custom properties, Google Fonts, Leaflet and Leaflet MarkerCluster (unchanged).

## Global Constraints

- Do not alter, reorder, wrap, remove, or add elements in any landing page body.
- Do not change copy, URLs, `id` values, scripts, JSON-LD, Leaflet markup/configuration, analytics, or outbound-link attributes.
- Limit production changes to `landing/tokens.css`, `landing/site.css`, and existing stylesheet references only when strictly required.
- Maintain keyboard-visible focus, `prefers-reduced-motion`, and dark-mode behavior.

---

## File Structure

- `landing/tokens.css` — canonical color, typography, spacing, motion, and radius tokens for every landing page.
- `landing/site.css` — page-neutral base and component selectors that restyle the already-present home, guide, and privacy markup.
- `landing/index.html` — only stylesheet references may be inspected/changed; its body and scripts remain byte-equivalent in structure and content.
- `landing/guias/{fansfishing,careca-pesca,la-paz}.html` and `landing/privacy-policy.html` — only stylesheet references may be inspected/changed; body markup remains unchanged.

### Task 1: Establish the no-structure-change baseline

**Files:**
- Modify: none
- Verify: `landing/index.html`, `landing/guias/fansfishing.html`, `landing/guias/careca-pesca.html`, `landing/guias/la-paz.html`, `landing/privacy-policy.html`

**Interfaces:**
- Consumes: the existing page source from `HEAD`.
- Produces: a repeatable structural comparison command used after CSS work.

- [ ] **Step 1: Capture the required body and script signatures from `HEAD`**

Run:
```bash
for f in landing/index.html landing/guias/fansfishing.html landing/guias/careca-pesca.html landing/guias/la-paz.html landing/privacy-policy.html; do
  printf '%s\n' "--- $f";
  git show "HEAD:$f" | sed -n '/<body/,/<\/body>/p' | shasum -a 256;
done
```
Expected: five SHA-256 hashes, one for each current body.

- [ ] **Step 2: Record invariant selectors and runtime anchors**

Run:
```bash
rg -n 'id="(mapa|guias|app|map)"|<script|analytics\.js|leaflet\.js|geojson|L\.map' landing/index.html
```
Expected: the map container, public anchors, analytics include, and existing Leaflet initialization are present.

- [ ] **Step 3: Do not commit**

The baseline is verification-only; no production files change in this task.

### Task 2: Finalize shared design tokens

**Files:**
- Modify: `landing/tokens.css`
- Test: CSS token reference scan

**Interfaces:**
- Consumes: existing home/guide/privacy selectors.
- Produces: `--color-*`, `--font-*`, `--space-*`, `--text-*`, `--ease-*`, `--dur-*`, `--rule-*`, and `--radius-*` values consumed exclusively via `var(...)` from `site.css`.

- [ ] **Step 1: Define the token contract at the top of `landing/tokens.css`**

Use the existing locked palette and type roles:
```css
:root {
  --color-paper: oklch(96% 0.010 90);
  --color-ink: oklch(24% 0.020 62);
  --color-ink-2: oklch(43% 0.022 60);
  --color-rule: oklch(80% 0.020 78);
  --color-accent: oklch(46% 0.058 233);
  --color-veg: oklch(52% 0.098 143);
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Newsreader', Georgia, serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
}
```
Add named spacing, type, duration, easing, rule, and radius tokens required by `site.css`; do not use raw color or font-family values outside this file.

- [ ] **Step 2: Add a dark-mode token override without changing markup**

```css
@media (prefers-color-scheme: dark) {
  :root { --color-paper: oklch(18% 0.016 235); }
}
```
Retain readable ink/rule/accent values in the same media block and preserve any explicit `[data-theme]` override already supported by the stylesheet.

- [ ] **Step 3: Verify CSS consumers use named tokens**

Run:
```bash
rg -n 'font-family: [^v]|(#[0-9A-Fa-f]{3,8}|rgb\(|hsl\(|oklch\()' landing/site.css
```
Expected: no raw colors or direct font-family declarations in `landing/site.css`; values belong in `tokens.css`.

- [ ] **Step 4: Commit the isolated token work**

```bash
git add landing/tokens.css
git commit -m "feat(landing): add editorial design tokens"
```

### Task 3: Apply the CSS-only editorial presentation

**Files:**
- Modify: `landing/site.css`
- Verify: `landing/index.html`, `landing/guias/*.html`, `landing/privacy-policy.html`

**Interfaces:**
- Consumes: Task 2’s token names and the current HTML class names/IDs.
- Produces: responsive presentation for the existing masthead, document entries, map, guide cards, calls-to-action, detail prose, and footer.

- [ ] **Step 1: Stamp and normalize the stylesheet**

Make the first line:
```css
/* Hallmark · macrostructure: Long Document · tone: Almanaque del Paraná · anchor hue: river blue */
```
Then apply base styles through `var(--color-*)`, `var(--font-*)`, and named spacing tokens. Preserve all existing selector targets; do not require a new class or wrapper.

- [ ] **Step 2: Style the existing home sections in document order**

Implement selector groups for existing home targets (`header`, `.wrap`, `.sec-head`, `#map`, `.guide`, `.station`, `.app-*`, `footer`) with hairline rules, stacked labels, editorial headings, and a responsive map. Keep the current section ordering and all element display roles intact.

- [ ] **Step 3: Style guide and privacy content using existing elements only**

Implement selectors already present on detail pages (`.breadcrumb`, `.article`, `.facts`, `details`, `.disclaimer`, `.guide-cta`) so they share the same reading measure and focus states. Do not edit the guide HTML or their independent content.

- [ ] **Step 4: Implement interaction and accessibility states**

```css
a:focus-visible,
button:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 150ms !important; animation-duration: 150ms !important; }
}
```
Use transform/opacity only for optional reveal states; no layout animation or focus-ring transition.

- [ ] **Step 5: Verify stylesheet integrity**

Run:
```bash
rg -n 'TODO|FIXME|font-family: [^v]|(#[0-9A-Fa-f]{3,8}|rgb\(|hsl\()' landing/site.css
```
Expected: no unfinished markers, raw colors, or direct font declarations.

- [ ] **Step 6: Commit the shared visual layer**

```bash
git add landing/site.css
git commit -m "feat(landing): apply editorial visual system"
```

### Task 4: Verify DOM invariants and page behavior

**Files:**
- Modify: none, except stylesheet references if a page lacks the shared CSS.
- Verify: all five landing HTML pages and browser screenshots.

**Interfaces:**
- Consumes: finalized CSS from Tasks 2–3.
- Produces: evidence that no content or structure changed.

- [ ] **Step 1: Check that each page loads the shared sheets**

Run:
```bash
for f in landing/index.html landing/guias/fansfishing.html landing/guias/careca-pesca.html landing/guias/la-paz.html landing/privacy-policy.html; do
  printf '%s: ' "$f";
  rg -q 'href="/tokens\.css"' "$f" && rg -q 'href="/site\.css"' "$f" && echo ok || echo missing;
done
```
Expected: `ok` for every page.

- [ ] **Step 2: Compare each body against `HEAD`**

Run:
```bash
for f in landing/index.html landing/guias/fansfishing.html landing/guias/careca-pesca.html landing/guias/la-paz.html landing/privacy-policy.html; do
  test "$(git show "HEAD:$f" | sed -n '/<body/,/<\/body>/p' | shasum -a 256)" = "$(sed -n '/<body/,/<\/body>/p' "$f" | shasum -a 256)" && echo "$f: unchanged" || echo "$f: BODY CHANGED";
done
```
Expected: `unchanged` for every page. Stop and revert any HTML body change before proceeding.

- [ ] **Step 3: Review desktop and mobile rendering**

Serve the static directory with the existing local deployment preview method, then inspect home, one guide, and privacy at 1440px and 390px. Confirm: map loads; layer controls work; guide and WhatsApp links remain clickable; keyboard focus is visible; no overflow; reduced-motion has no spatial animation.

- [ ] **Step 4: Run the project’s existing automated checks**

Run:
```bash
npm run start -- --help
```
Expected: Expo prints the command help without modifying production files. This repository has no landing-specific test script; visual and DOM verification above are the applicable checks.

- [ ] **Step 5: Commit any strictly necessary stylesheet-reference correction**

```bash
git add landing/index.html landing/guias/fansfishing.html landing/guias/careca-pesca.html landing/guias/la-paz.html landing/privacy-policy.html
git commit -m "fix(landing): load shared editorial styles"
```
Run this only if stylesheet references actually required correction; otherwise make no commit.
