# Site Redesign — Modern Professional Hub

**Date:** 2026-05-16
**Owner:** Scott Soward
**Status:** Approved for implementation planning

---

## 1. Purpose

The site began as a "church / gospel study" hub. It has since absorbed tech presentations, conference dashboards, learning activities, and scripture study tools. The current design carries the original framing — deep blue + gold, religious eyebrow text, per-section color recoloring — which no longer represents the site's full scope.

Redesign goal: a **personal, modern, professional hub for Scott Soward** where gospel content lives as one section, not the dominant brand. Every page shares the same chrome, the same components, the same accessibility floor, and adapts cleanly from 360 px to 1440 px.

## 2. Non-goals

- Rewriting individual Reveal.js slide content.
- Replacing existing functionality (Alma 31 search, conference maps, day-tab logic, activities — all preserved).
- Adding a build step or framework. Site stays pure static HTML/CSS/JS.
- Writing new bio / about copy. A short placeholder identity line is acceptable; user will refine later.
- Re-theming the third-party Reveal.js framework itself — only a CSS override that sits on top.

## 3. Success criteria

1. Every page in the page list (§ 7) uses the shared `css/site.css` and renders consistent chrome (header, nav, footer).
2. WCAG 2.1 AA conformance on hub pages and Alma 31: skip link works, all interactive elements keyboard-reachable with visible focus, no `onclick` on non-interactive elements, ARIA correct, color contrast ≥ 4.5 : 1 body / ≥ 3 : 1 large text + UI.
3. No horizontal scroll between 320 px and 1920 px viewport on any page.
4. Lighthouse Accessibility score ≥ 95 on root `index.html`, `presentations/index.html`, and `alma31.html`.
5. All 15 Reveal.js decks load the shared `css/reveal-site-theme.css` and look visually harmonized with the rest of the site (typography + accent color + link color).
6. Service worker cache list updated; no stale assets after deploy.

## 4. Design system

### 4.1 Color tokens

```
--ink:        #0f172a   /* primary text */
--ink-soft:   #334155   /* secondary text */
--muted:      #64748b   /* tertiary, meta, captions */
--bg:         #ffffff   /* page background */
--surface:    #f8fafc   /* alt section background */
--surface-2:  #f1f5f9   /* deeper alt */
--border:     #e2e8f0
--border-strong: #cbd5e1
--accent:     #1d4ed8   /* single brand accent — links, primary button, focus ring */
--accent-ink: #1e3a8a   /* hover / active */
--accent-soft:#eff6ff   /* chip backgrounds, soft highlights */
--warn:       #b45309   /* dates, deadlines (sparingly) */
--success:    #15803d   /* confirmations */
--danger:     #b91c1c
```

Category chips (muted, used only as small labels — they do not recolor the whole card):

```
chip-gospel:     bg #f1f5f9  ink #334155
chip-tech:       bg #eef2ff  ink #4338ca
chip-scripture:  bg #fffbeb  ink #92400e
chip-activity:   bg #ecfdf5  ink #047857
chip-conference: bg #fff1f2  ink #be123c
```

### 4.2 Typography

System font stack only (no web font dependency):

```
font-family:
  -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Helvetica Neue", Arial, sans-serif;
```

Scale (rem):

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 0.75 | meta, eyebrow, chips |
| `--fs-sm` | 0.875 | UI, captions |
| `--fs-base` | 1 | body |
| `--fs-md` | 1.125 | lead paragraph |
| `--fs-lg` | 1.25 | h3 |
| `--fs-xl` | 1.5 | h2 |
| `--fs-2xl` | 1.875 | h1 |
| `--fs-display` | `clamp(2rem, 4vw, 3rem)` | hero h1 |

- Body line-height 1.6; headings 1.2.
- `.prose` clamps measure to 68ch.
- Letter-spacing: -0.01em on display, 0.08em uppercase eyebrows.

### 4.3 Spacing, radius, shadow, motion

```
spacing (8-pt):  4 8 12 16 24 32 48 64 96 px
radius:          --r-sm 4   --r-md 8   --r-lg 12   --r-pill 999
shadow-1: 0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)
shadow-2: 0 4px 16px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.04)
transition: 160ms ease    (longer durations gated by prefers-reduced-motion)
```

`@media (prefers-reduced-motion: reduce)` disables transforms and limits transitions to opacity/color only.

### 4.4 Layout

- Content max-width 1100 px. Prose max-width 68ch (~720 px).
- Card grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`, gap 24 px.
- Header content max-width matches main.
- Vertical rhythm: 96 px hero padding-y on desktop, 48 px on mobile.

### 4.5 Breakpoints (mobile-first)

```
sm: 640px
md: 900px
lg: 1200px
```

- < 640 px: nav becomes a disclosure (hamburger) that expands to a vertical list. Cards single-column. Hero padding compresses.
- 640–899 px: nav inline (may wrap). Cards 2-up.
- ≥ 900 px: cards 3-up where space allows. Full hero.

## 5. Components (in `css/site.css`)

| Component | Notes |
|---|---|
| `.skip-link` | Visually hidden until focused; jumps to `#main`. |
| `.site-header` | Sticky, white, 1 px bottom border. Brand mark left ("Scott Soward" word-mark + role line), nav right. |
| `.site-nav` | Inline links above 640 px. Below, a `<button aria-expanded>` toggles the list. Active link uses `aria-current="page"` and a heavier weight + 2-px underline in accent. |
| `.site-hero` | Per-page eyebrow + h1 + lede. No background imagery; whitespace and type do the work. |
| `.section` + `.section-eyebrow` + `.section-title` | Standard section header pattern. |
| `.card` | White surface, 1-px border, radius 12, shadow-1. Hover: shadow-2 + 2-px lift. Card body uses neutral type; category communicated by chip, not by recoloring the card. |
| `.card-grid` | The grid wrapper. |
| `.chip` | Small pill label with category modifier. |
| `.btn`, `.btn-primary`, `.btn-ghost` | Real `<button>` / `<a class="btn">`. Min height 40 px (touch 44). Focus ring is a 2-px solid accent outline + 2-px offset. |
| `.prose` | Long-form text: paragraph spacing, list styling, blockquote, inline code. Used for Alma 31 verses, analysis, etc. |
| `.tabs` + `.tab` + `.tab-panel` | Proper `role="tablist"` pattern for conference day tabs. Roving tabindex, arrow-key navigation. |
| `.site-footer` | Single quiet row: name, year, GitHub link. |

## 6. Page list

### Hub pages (5)

| Path | New chrome | Notes |
|---|---|---|
| `index.html` | yes | Lead with identity, then unified card grid. Filters become `<button aria-pressed>` toggles. |
| `presentations/index.html` | yes | Gospel hub. |
| `tech-presentations/index.html` | yes | Tech & AI hub. |
| `activities/index.html` | yes | Activities hub. |
| `conferences/index.html` | yes | Conferences hub. |

### Alma 31 study (6)

| Path | Notes |
|---|---|
| `alma31.html` | Entry page restyled. |
| `pages/scripture.html` | Uses `.prose` for verses; search input gets `<label>`. |
| `pages/analysis.html` | `.prose`. |
| `pages/gallery.html` | Card grid + accessible lightbox (focus trap, ESC close). |
| `pages/applications.html` | Mixed content; sections + cards. |
| `pages/about.html` | `.prose`. |

### Conference detail (2)

| Path | Notes |
|---|---|
| `conferences/atlassian-team-26/index.html` | Day tabs become proper `role="tablist"` with arrow-key roving. Map preserved. |
| `conferences/rootstech-2026/index.html` | Same tab pattern. Existing dashboard sections retained. |

### Activities (1)

| Path | Notes |
|---|---|
| `activities/hat-riddle/index.html` | Shared chrome; interactive body preserved. |

### Reveal.js decks (15)

All under `presentations/*/index.html` and `tech-presentations/*/index.html` plus `presentations/confidence-in-presence-of-god/confidence-presentation.html`. Each adds `<link rel="stylesheet" href="/css/reveal-site-theme.css">` after the existing Reveal theme link.

### New CSS files (2)

- `css/site.css` — full design system.
- `css/reveal-site-theme.css` — Reveal.js cosmetic override (colors, fonts, link, blockquote, heading scale, slide number).

### Touched system files

- `sw.js` — add the two new CSS files to the precache list; bump cache version.
- `manifest.json` — verify name/short_name match new identity (e.g., "Scott Soward"). Theme color updated to accent.

## 7. Accessibility requirements (WCAG 2.1 AA)

1. **Landmarks:** every page has `<header>`, `<nav>`, `<main id="main">`, `<footer>`.
2. **Skip link** is the first focusable element on every page; jumps to `#main`.
3. **No clickable `<div>`s.** Every filter, tab, expand control is a `<button>`. Every link is an `<a>`.
4. **Keyboard:**
   - All interactive elements reachable in logical order.
   - Visible `:focus-visible` rings (2-px solid `--accent`, 2-px offset).
   - Tablist supports `Left/Right/Home/End` and roving tabindex.
   - Hamburger uses `aria-expanded` + Escape-to-close.
5. **ARIA:**
   - `aria-current="page"` on the active nav link.
   - `aria-pressed` on filter toggles.
   - `aria-hidden="true"` on decorative SVG/emoji.
   - Icon-only buttons have `aria-label`.
   - Gallery lightbox is `role="dialog" aria-modal="true"` with focus trap.
6. **Contrast:**
   - Body text on white: ≥ 4.5 : 1 (`#0f172a` = 19.3 : 1 ✓).
   - Muted captions on white: `#64748b` = 4.5 : 1 ✓.
   - Accent on white: `#1d4ed8` = 7.7 : 1 ✓.
   - White on accent button: 7.7 : 1 ✓.
   - Verify chip text/bg combinations.
7. **Motion:** `@media (prefers-reduced-motion: reduce)` removes lift transforms and reduces transitions to opacity/color.
8. **Forms** (Alma 31 search): visible `<label>`, `aria-describedby` for help text, results announced via `aria-live="polite"`.

## 8. Reveal.js theme override

`css/reveal-site-theme.css` overrides — kept narrow:

- `.reveal` font stack → site sans.
- `.reveal h1/h2/h3` → site weight/letter-spacing, `--ink` color.
- `.reveal a` → `--accent`.
- `.reveal blockquote` → left rule in `--accent`, italic muted text.
- `.reveal .slide-number` → muted small.
- Background stays slide-author's choice; we do not force a background color.

Loaded *after* the existing Reveal theme stylesheet so cascade wins. If a deck breaks, the fix is local to that deck — we keep the override scoped via `.reveal` to avoid leaking.

## 9. Testing plan

### Manual

1. Start dev server: `npm start` (serves at http://localhost:8080).
2. Walk every page in § 6 in Chrome at 1280 px. Verify:
   - Header, nav, footer identical.
   - Active nav state on current page.
   - Skip link appears on first Tab.
   - Cards render and links work.
3. Mobile sweep at 360 px (DevTools): nav disclosure works, no horizontal scroll, cards stack, touch targets large enough.
4. Tablet sweep at 768 px.
5. Keyboard sweep of root `index.html`, `presentations/index.html`, `alma31.html`, `conferences/atlassian-team-26/index.html`: Tab through; verify focus visible and logical; activate filter buttons / tabs with keyboard.
6. `prefers-reduced-motion: reduce` (DevTools rendering panel): transforms suppressed.

### Automated

- HTML validation: `npx html-validate "**/*.html" --ignore-pattern node_modules`. Fix all errors; warnings logged.
- Lighthouse (Chrome DevTools) on root, presentations hub, alma31. Capture Accessibility / Best Practices / SEO scores. Accessibility ≥ 95 required; others recorded.
- Optional: axe-core run via the browser extension on the same three pages.

### Visual regression

Not automated. Spot-check screenshots before/after for each of the 5 hub pages — kept locally only.

## 10. Implementation order (high level — full plan via writing-plans)

1. Author `css/site.css` (tokens + components).
2. Author `css/reveal-site-theme.css`.
3. Refactor root `index.html` — proves the system end-to-end.
4. Refactor four section hubs to match.
5. Refactor Alma 31 entry + 5 sub-pages.
6. Refactor 2 conference detail pages (tabs need ARIA work).
7. Refactor 1 activity.
8. Add reveal-site-theme link to all 15 Reveal.js decks.
9. Update `sw.js` cache list + bump version. Verify `manifest.json`.
10. Test sweep (§ 9). Fix what fails.
11. Commit, push to `main`.

## 11. Risks / open questions

- **Reveal.js cascade:** some decks have heavily customized inline styles. Override may be cosmetically partial on those. Mitigation: scope override to `.reveal` selectors; if a deck looks worse, drop its theme link rather than reshape the deck.
- **Gallery lightbox** in Alma 31 may need real focus-trap JS (currently unknown how it's implemented). Will assess during refactor; if it's `onclick`-driven, rewrite to dialog pattern.
- **Conference day tabs** may use a `display:none`/click pattern. Need to refactor to `role="tablist"` without breaking existing JS that toggles tab state.
- **Service worker stale cache:** users with the old SW will keep seeing old CSS until it updates. Bumping the SW version forces refresh.
- **Bio copy:** placeholder text only. User refines later.

## 12. Acceptance checklist

- [ ] `css/site.css` and `css/reveal-site-theme.css` exist and are linked from every page.
- [ ] No inline `<style>` block on hub pages, Alma 31 pages, conference detail pages, or activity pages (page-specific tweaks may live in `<style>` blocks only when they don't override shared components).
- [ ] Every interactive element is keyboard-operable with visible focus.
- [ ] Skip link present on every page, jumps to `#main`.
- [ ] Day tabs on conference pages pass keyboard navigation (Left/Right/Home/End, Enter/Space activate).
- [ ] No console errors on any page.
- [ ] Lighthouse Accessibility ≥ 95 on the three target pages.
- [ ] Service worker version bumped and cache list current.
- [ ] `git status` clean, all changes committed, pushed to `main`.
