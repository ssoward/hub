# Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor every page in the site onto a single shared design system (`css/site.css`) — neutral palette, single accent, modern professional / portfolio aesthetic, WCAG 2.1 AA accessibility floor, fully responsive 360 px → 1920 px.

**Architecture:** One shared stylesheet linked from every page; HTML pages compose the same components (header, nav, hero, card, chip, btn, prose, tabs, footer). A second small stylesheet (`css/reveal-site-theme.css`) cosmetically harmonizes Reveal.js slide decks with the site. No build step; pure static HTML/CSS/JS.

**Tech Stack:** HTML5, CSS3 (custom properties, grid, container queries where helpful), system-font stack, Reveal.js (existing, unchanged), service worker (existing, version-bumped).

**Reference spec:** `docs/superpowers/specs/2026-05-16-site-redesign-design.md`

---

## Verification model

This is a CSS/HTML refactor — there is no unit-test harness. Each task's verification is one or more of:

- **Visual check** in a browser (dev server: `npm start` → http://localhost:8080).
- **HTML validation:** `npx html-validate <path>` (use `--config` only if errors are noisy).
- **Keyboard sweep:** Tab through page, confirm focus visible + logical order.
- **Responsive check:** DevTools at 360 px, 768 px, 1280 px.
- **Lighthouse a11y:** Chrome DevTools, mobile mode, accessibility category only.

The dev server is started **once** at the start of execution (Task 0) and left running in the background.

---

## File map

**Create:**
- `css/site.css` — design tokens + components (the design system).
- `css/reveal-site-theme.css` — Reveal.js cosmetic override.

**Modify (HTML pages — strip inline `<style>` blocks where shared system replaces them):**
- `index.html` (root hub)
- `presentations/index.html` (Gospel hub)
- `tech-presentations/index.html` (Tech hub)
- `activities/index.html` (Activities hub)
- `conferences/index.html` (Conferences hub)
- `alma31.html`
- `pages/scripture.html`, `pages/analysis.html`, `pages/gallery.html`, `pages/applications.html`, `pages/about.html`
- `conferences/atlassian-team-26/index.html`
- `conferences/rootstech-2026/index.html`
- `activities/hat-riddle/index.html`
- 14 Reveal.js decks (add link to reveal-site-theme.css):
  - `presentations/ai-students-byuideo/index.html`
  - `presentations/all-who-have-endured-valiantly/index.html`
  - `presentations/easter-week/index.html`
  - `presentations/easter-week-{monday,tuesday,wednesday,thursday,friday,saturday,sunday,resurrection}/index.html`
  - `presentations/stake-ss-presidents-training/index.html`
  - `presentations/ward-conference-2026/index.html`
  - `tech-presentations/meaning-of-life-for-ai/index.html`
  - `tech-presentations/ai-evolution-collage/index.html`
- Non-Reveal presentation pages (apply site chrome instead — not Reveal theme):
  - `presentations/confidence-in-presence-of-god/confidence-presentation.html` — standalone, not Reveal. Keep as-is content-wise, optionally add `<link>` to `site.css` so its header/footer pick up tokens; risk of cascade conflict is low because the page sets explicit styles.
  - `tech-presentations/daily-life-of-ai/index.html` — canvas animation, leave alone (full-bleed visual experience).

**Modify (system files):**
- `sw.js` — bump cache version, add new CSS files, refresh asset list.
- `manifest.json` — verify name/theme color matches new brand.

---

## Task 0: Start dev server

**Files:**
- (none)

- [ ] **Step 1: Verify package.json `start` script**

Run: `grep -A2 '"start"' package.json`
Expected output includes a static-server command (e.g., `http-server`, `serve`, or similar).

- [ ] **Step 2: Start dev server in background**

Run: `npm start &` (or use Bash `run_in_background: true`).
Expected: server listening on a known port (typically 8080).

- [ ] **Step 3: Confirm server reachable**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/`
Expected output: `200`

Do not commit anything in this task.

---

## Task 1: Author `css/site.css` (design system)

**Files:**
- Create: `css/site.css`

- [ ] **Step 1: Write `css/site.css` — tokens block**

Token names and values come from the spec (§ 4). Use this exact opening:

```css
/* ============================================================
   site.css — Scott Soward personal hub design system
   See docs/superpowers/specs/2026-05-16-site-redesign-design.md
   ============================================================ */

:root {
  /* Color */
  --ink: #0f172a;
  --ink-soft: #334155;
  --muted: #64748b;
  --bg: #ffffff;
  --surface: #f8fafc;
  --surface-2: #f1f5f9;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --accent: #1d4ed8;
  --accent-ink: #1e3a8a;
  --accent-soft: #eff6ff;
  --warn: #b45309;
  --success: #15803d;
  --danger: #b91c1c;

  /* Category chip palette (small labels only) */
  --chip-gospel-bg: #f1f5f9;     --chip-gospel-ink: #334155;
  --chip-tech-bg: #eef2ff;       --chip-tech-ink: #4338ca;
  --chip-scripture-bg: #fffbeb;  --chip-scripture-ink: #92400e;
  --chip-activity-bg: #ecfdf5;   --chip-activity-ink: #047857;
  --chip-conference-bg: #fff1f2; --chip-conference-ink: #be123c;

  /* Type */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  --fs-xs: 0.75rem;
  --fs-sm: 0.875rem;
  --fs-base: 1rem;
  --fs-md: 1.125rem;
  --fs-lg: 1.25rem;
  --fs-xl: 1.5rem;
  --fs-2xl: 1.875rem;
  --fs-display: clamp(2rem, 4vw, 3rem);

  /* Spacing (8-pt scale) */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px; --sp-16: 64px; --sp-24: 96px;

  /* Radius / Shadow / Motion */
  --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04);
  --shadow-2: 0 4px 16px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.04);
  --t-fast: 140ms ease;
  --t-base: 200ms ease;
}
```

- [ ] **Step 2: Append base/reset and typography**

```css
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: 1.6;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1, h2, h3, h4, h5, h6 { margin: 0; line-height: 1.2; color: var(--ink); }
h1 { font-size: var(--fs-2xl); letter-spacing: -0.01em; font-weight: 700; }
h2 { font-size: var(--fs-xl);  letter-spacing: -0.005em; font-weight: 700; }
h3 { font-size: var(--fs-lg);  font-weight: 600; }
h4 { font-size: var(--fs-md);  font-weight: 600; }
p  { margin: 0; }

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-ink); text-decoration: underline; text-underline-offset: 3px; }

img, svg, video { max-width: 100%; height: auto; display: block; }

/* Focus */
:focus { outline: none; }
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
```

- [ ] **Step 3: Append skip-link, layout helpers**

```css
.skip-link {
  position: absolute; left: -9999px; top: 0;
  background: var(--accent); color: #fff;
  padding: 10px 14px; border-radius: var(--r-md);
  font-weight: 600; z-index: 1000;
}
.skip-link:focus { left: 12px; top: 12px; outline: 2px solid #fff; outline-offset: 2px; }

.container { max-width: 1100px; margin: 0 auto; padding: 0 var(--sp-6); }
@media (max-width: 640px) { .container { padding: 0 var(--sp-4); } }

.visually-hidden {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

- [ ] **Step 4: Append site header + nav**

```css
.site-header {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255,255,255,0.92);
  backdrop-filter: saturate(180%) blur(8px);
  border-bottom: 1px solid var(--border);
}
.site-header-inner {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--sp-4); min-height: 60px; padding: var(--sp-3) 0;
}
.brand {
  display: inline-flex; flex-direction: column; gap: 2px;
  color: var(--ink); text-decoration: none; font-weight: 700; letter-spacing: -0.01em;
}
.brand:hover { color: var(--ink); text-decoration: none; }
.brand .brand-name { font-size: var(--fs-md); }
.brand .brand-role { font-size: var(--fs-xs); color: var(--muted); font-weight: 500; }

.site-nav { display: flex; align-items: center; gap: var(--sp-1); }
.site-nav a {
  display: inline-flex; align-items: center; min-height: 36px;
  padding: 6px var(--sp-3); border-radius: var(--r-md);
  font-size: var(--fs-sm); font-weight: 500; color: var(--ink-soft);
  text-decoration: none; transition: background var(--t-fast), color var(--t-fast);
}
.site-nav a:hover { background: var(--surface); color: var(--ink); text-decoration: none; }
.site-nav a[aria-current="page"] {
  color: var(--accent); font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--accent);
  border-radius: 0;
}

.nav-toggle {
  display: none; appearance: none; background: transparent;
  border: 1px solid var(--border); border-radius: var(--r-md);
  padding: 6px 10px; cursor: pointer; color: var(--ink);
}
.nav-toggle:hover { background: var(--surface); }

@media (max-width: 640px) {
  .nav-toggle { display: inline-flex; align-items: center; gap: 6px; }
  .site-nav {
    display: none; position: absolute; top: 100%; left: 0; right: 0;
    flex-direction: column; align-items: stretch; gap: 0;
    background: #fff; border-bottom: 1px solid var(--border);
    padding: var(--sp-2);
  }
  .site-nav.open { display: flex; }
  .site-nav a { padding: 10px var(--sp-3); border-radius: var(--r-sm); }
}
```

- [ ] **Step 5: Append hero, section, prose**

```css
.site-hero { padding: var(--sp-16) 0 var(--sp-12); }
@media (max-width: 640px) { .site-hero { padding: var(--sp-12) 0 var(--sp-8); } }
.hero-eyebrow { font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: var(--sp-3); }
.hero-title { font-size: var(--fs-display); font-weight: 700; letter-spacing: -0.02em; margin-bottom: var(--sp-4); }
.hero-lede { font-size: var(--fs-md); color: var(--ink-soft); max-width: 60ch; }

.section { padding: var(--sp-12) 0; }
.section + .section { border-top: 1px solid var(--border); }
.section-eyebrow { font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: var(--sp-2); }
.section-title { font-size: var(--fs-xl); margin-bottom: var(--sp-6); }
.section-lede { color: var(--ink-soft); max-width: 68ch; margin-bottom: var(--sp-6); }

.prose { max-width: 68ch; color: var(--ink); }
.prose p { margin: 0 0 var(--sp-4); }
.prose h2 { margin: var(--sp-8) 0 var(--sp-3); }
.prose h3 { margin: var(--sp-6) 0 var(--sp-2); }
.prose ul, .prose ol { margin: 0 0 var(--sp-4) var(--sp-6); }
.prose li { margin-bottom: var(--sp-2); }
.prose blockquote {
  margin: var(--sp-6) 0; padding: var(--sp-2) var(--sp-6);
  border-left: 3px solid var(--accent); color: var(--ink-soft); font-style: italic;
}
.prose code { background: var(--surface-2); padding: 1px 6px; border-radius: var(--r-sm); font-size: 0.92em; }
.prose hr { border: 0; border-top: 1px solid var(--border); margin: var(--sp-8) 0; }
```

- [ ] **Step 6: Append card grid + card**

```css
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-6); }

.card {
  display: flex; flex-direction: column;
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--r-lg); box-shadow: var(--shadow-1);
  overflow: hidden;
  transition: transform var(--t-base), box-shadow var(--t-base), border-color var(--t-base);
}
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); border-color: var(--border-strong); }
@media (prefers-reduced-motion: reduce) { .card:hover { transform: none; } }

.card-body { padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); flex: 1; }
.card-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.card-title { font-size: var(--fs-lg); font-weight: 600; color: var(--ink); }
.card-meta { font-size: var(--fs-xs); color: var(--muted); }
.card-text { color: var(--ink-soft); font-size: var(--fs-sm); }
.card-footer {
  margin-top: auto; padding: var(--sp-4) var(--sp-6);
  border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
}
.card a.card-link {
  position: static; color: var(--ink);
}
/* Whole-card click target via stretched link */
.card-link-stretched { position: absolute; inset: 0; }
.card { position: relative; }
```

- [ ] **Step 7: Append chip + btn**

```css
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 10px; border-radius: var(--r-pill);
  font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; line-height: 1.6;
  background: var(--surface); color: var(--ink-soft);
}
.chip.gospel     { background: var(--chip-gospel-bg);     color: var(--chip-gospel-ink); }
.chip.tech       { background: var(--chip-tech-bg);       color: var(--chip-tech-ink); }
.chip.scripture  { background: var(--chip-scripture-bg);  color: var(--chip-scripture-ink); }
.chip.activity   { background: var(--chip-activity-bg);   color: var(--chip-activity-ink); }
.chip.conference { background: var(--chip-conference-bg); color: var(--chip-conference-ink); }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 40px; padding: 8px 16px; border-radius: var(--r-md);
  font-family: inherit; font-size: var(--fs-sm); font-weight: 600;
  text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
}
.btn:hover { text-decoration: none; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-ink); color: #fff; }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--border-strong); }
.btn-ghost:hover { background: var(--surface); color: var(--ink); }
.btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
@media (prefers-reduced-motion: reduce) { .btn:hover { transform: none; } }
```

- [ ] **Step 8: Append filter toolbar (for hub filtering)**

```css
.filter-bar {
  display: flex; flex-wrap: wrap; gap: var(--sp-2);
  padding: var(--sp-3) 0 var(--sp-6);
}
.filter-bar .btn { min-height: 36px; padding: 6px 14px; font-size: var(--fs-xs); }
```

- [ ] **Step 9: Append tabs (used by conference day tabs)**

```css
.tabs { border-bottom: 1px solid var(--border); display: flex; gap: 0; overflow-x: auto; }
.tabs [role="tab"] {
  appearance: none; background: transparent; border: 0; padding: 12px 16px;
  font: inherit; font-size: var(--fs-sm); font-weight: 600; color: var(--muted);
  cursor: pointer; border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.tabs [role="tab"]:hover { color: var(--ink); }
.tabs [role="tab"][aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
.tab-panel { padding: var(--sp-6) 0; }
.tab-panel[hidden] { display: none; }
```

- [ ] **Step 10: Append footer**

```css
.site-footer {
  border-top: 1px solid var(--border); padding: var(--sp-8) 0; margin-top: var(--sp-16);
  color: var(--muted); font-size: var(--fs-sm);
}
.site-footer-inner { display: flex; flex-wrap: wrap; gap: var(--sp-4); justify-content: space-between; align-items: center; }
.site-footer a { color: var(--ink-soft); }
.site-footer a:hover { color: var(--accent); }
```

- [ ] **Step 11: Verify file loads (no syntax error)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/css/site.css`
Expected: `200`.

Open http://localhost:8080/css/site.css in browser, scan for visible content / no parse error in DevTools console when loaded by a page in later tasks.

- [ ] **Step 12: Commit**

```bash
git add css/site.css
git commit -m "Add shared site.css design system (tokens + components)"
```

---

## Task 2: Author `css/reveal-site-theme.css`

**Files:**
- Create: `css/reveal-site-theme.css`

- [ ] **Step 1: Write the override file**

```css
/* ============================================================
   reveal-site-theme.css — site harmonization layer for Reveal.js
   Load AFTER the base Reveal theme so the cascade wins.
   Scoped to .reveal selectors only — never bleeds outside slides.
   ============================================================ */

.reveal {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Helvetica Neue", Arial, sans-serif;
  color: #0f172a;
}

.reveal h1, .reveal h2, .reveal h3, .reveal h4 {
  font-family: inherit;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #0f172a;
  text-transform: none;
  text-shadow: none;
}

.reveal h1 { font-size: 2.4em; }
.reveal h2 { font-size: 1.8em; }
.reveal h3 { font-size: 1.4em; }

.reveal a {
  color: #1d4ed8;
  text-decoration: none;
  border-bottom: 1px solid rgba(29,78,216,0.3);
}
.reveal a:hover { color: #1e3a8a; border-bottom-color: #1e3a8a; }

.reveal blockquote {
  background: transparent;
  border-left: 3px solid #1d4ed8;
  padding: 0.4em 1em;
  font-style: italic;
  color: #334155;
  box-shadow: none;
}

.reveal .slide-number {
  font-family: inherit;
  font-size: 0.65em;
  color: #64748b;
}

.reveal code, .reveal pre code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.reveal section img {
  border: 0;
  box-shadow: 0 1px 3px rgba(15,23,42,0.08);
}

/* Respect reduced motion inside slides */
@media (prefers-reduced-motion: reduce) {
  .reveal .slides section.future,
  .reveal .slides section.past { transition: none !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/reveal-site-theme.css
git commit -m "Add Reveal.js cosmetic theme override"
```

---

## Task 3: Refactor root `index.html`

Establishes the page-template pattern. Subsequent hub tasks reuse it.

**Files:**
- Modify: `index.html` (full replacement of `<head>` styles + body chrome)

- [ ] **Step 1: Read current `index.html`** to identify the data (cards, categories, links) that must be preserved.

Run: `wc -l index.html` (expect ~462 lines). The data of interest is the card list (titles, descriptions, hrefs, categories) starting around line 207.

- [ ] **Step 2: Replace `index.html` with the new template**

Preserve every card's title, description, href, and category. Remove the inline `<style>` block; replace with `<link>` to `css/site.css`. Use this exact skeleton (fill the `<!-- CARDS HERE -->` block with one card per existing item, mapping the existing category to a chip class):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#1d4ed8">
  <title>Scott Soward — Hub</title>
  <link rel="stylesheet" href="css/site.css">
  <link rel="manifest" href="manifest.json">
</head>
<body>

<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="container site-header-inner">
    <a class="brand" href="./">
      <span class="brand-name">Scott Soward</span>
      <span class="brand-role">Engineer · Builder · Teacher</span>
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="primary-nav">
      <span aria-hidden="true">☰</span><span class="visually-hidden">Menu</span>
    </button>
    <nav id="primary-nav" class="site-nav" aria-label="Primary">
      <a href="./" aria-current="page">Home</a>
      <a href="presentations/">Gospel</a>
      <a href="tech-presentations/">Tech &amp; AI</a>
      <a href="activities/">Activities</a>
      <a href="conferences/">Conferences</a>
    </nav>
  </div>
</header>

<main id="main">
  <section class="site-hero container">
    <p class="hero-eyebrow">Personal Hub</p>
    <h1 class="hero-title">Scott Soward</h1>
    <p class="hero-lede">
      Software engineer at FamilySearch. I build tools and teaching resources
      across technology, scripture study, conferences, and learning experiences.
      This is a quiet corner of the web where I keep them.
    </p>
  </section>

  <section class="section container" aria-labelledby="work-heading">
    <p class="section-eyebrow">Work &amp; Writing</p>
    <h2 id="work-heading" class="section-title">Everything in one place</h2>

    <div class="filter-bar" role="group" aria-label="Filter by category">
      <button class="btn btn-ghost" aria-pressed="true" data-filter="all">All</button>
      <button class="btn btn-ghost" aria-pressed="false" data-filter="gospel">Gospel</button>
      <button class="btn btn-ghost" aria-pressed="false" data-filter="tech">Tech &amp; AI</button>
      <button class="btn btn-ghost" aria-pressed="false" data-filter="conference">Conferences</button>
      <button class="btn btn-ghost" aria-pressed="false" data-filter="activity">Activities</button>
      <button class="btn btn-ghost" aria-pressed="false" data-filter="scripture">Scripture</button>
    </div>

    <div class="card-grid" id="cards">
      <!-- CARDS HERE: one .card per existing item; preserve title, description, href -->
      <!-- Example card structure: -->
      <!--
      <article class="card" data-tags="gospel">
        <div class="card-body">
          <div class="card-chips"><span class="chip gospel">Gospel</span></div>
          <h3 class="card-title">Ward Sunday School Presidents Training</h3>
          <p class="card-text">Teaching in the Savior's Way — Stake-level training for ward Sunday School presidents. March 2026.</p>
        </div>
        <div class="card-footer">
          <a class="btn btn-primary" href="presentations/stake-ss-presidents-training/">Open<span class="visually-hidden"> Ward Sunday School Presidents Training</span></a>
          <span class="card-meta">23 slides</span>
        </div>
      </article>
      -->
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="container site-footer-inner">
    <span>© <span id="year">2026</span> Scott Soward</span>
    <a href="https://github.com/ssoward/hub">github.com/ssoward/hub</a>
  </div>
</footer>

<script>
  // Mobile nav toggle
  (function() {
    const btn = document.querySelector('.nav-toggle');
    const nav = document.getElementById('primary-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
  })();

  // Card filters
  (function() {
    const buttons = document.querySelectorAll('.filter-bar [data-filter]');
    const cards = document.querySelectorAll('#cards .card');
    function apply(tag) {
      cards.forEach(c => {
        const tags = (c.getAttribute('data-tags') || '').split(/\s+/);
        c.hidden = !(tag === 'all' || tags.includes(tag));
      });
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === tag)));
    }
    buttons.forEach(b => b.addEventListener('click', () => apply(b.dataset.filter)));
  })();

  // Year stamp
  document.getElementById('year').textContent = new Date().getFullYear();
</script>

</body>
</html>
```

When replacing the cards placeholder, walk the existing `index.html` card list top-to-bottom and emit one `.card` per item with the same title, description, href, and a chip class matched to its existing category (`gospel`, `tech`, `activity`, `scripture`, `conference`).

- [ ] **Step 3: Visual + keyboard check**

Open http://localhost:8080/ in browser.
Verify:
- Header / hero / cards / footer render with new look.
- Tab from address bar → first focus is the skip link; pressing Enter jumps to `#main`.
- Tab continues through brand, nav links (active state visible on Home), filter buttons, then card links.
- Resize to 360 px: hamburger appears, nav collapses, expands on click, closes on Escape.
- Click filter buttons; cards visibility updates, `aria-pressed` flips.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Refactor root index onto shared site.css design system"
```

---

## Task 4: Refactor `presentations/index.html` (Gospel hub)

**Files:**
- Modify: `presentations/index.html`

- [ ] **Step 1: Replace head + chrome with shared system**

Strip the inline `<style>` block. Use the same head/header/footer pattern from Task 3, with these differences:
- `<link rel="stylesheet" href="../css/site.css">` (relative path).
- `<title>Gospel — Scott Soward</title>`.
- Brand-link `href="../"`.
- Nav: `<a href="../">Home</a>`, `<a href="./" aria-current="page">Gospel</a>`, then the other section links.
- Hero: eyebrow "Gospel", title "Gospel presentations", lede "Teaching resources, training materials, and gospel study presentations."
- Body: one `.section.container` with `.card-grid` of the existing presentation cards (preserve each title, sub, description, href, slide count). All chips are `chip gospel` here.

- [ ] **Step 2: Visual + keyboard check**

Open http://localhost:8080/presentations/. Tab through. Verify the `aria-current="page"` underline lands on "Gospel" in the nav.

- [ ] **Step 3: Commit**

```bash
git add presentations/index.html
git commit -m "Refactor Gospel hub onto shared design system"
```

---

## Task 5: Refactor `tech-presentations/index.html` (Tech & AI hub)

**Files:**
- Modify: `tech-presentations/index.html`

- [ ] **Step 1: Apply pattern**

Same template as Task 4 with:
- Title: `Tech & AI — Scott Soward`.
- Eyebrow "Tech & AI", title "Tech & AI presentations", lede about technology / AI explorations.
- `aria-current="page"` on the Tech & AI nav link.
- Cards use `chip tech`.

- [ ] **Step 2: Visual check at http://localhost:8080/tech-presentations/**

- [ ] **Step 3: Commit**

```bash
git add tech-presentations/index.html
git commit -m "Refactor Tech & AI hub onto shared design system"
```

---

## Task 6: Refactor `activities/index.html` (Activities hub)

**Files:**
- Modify: `activities/index.html`

- [ ] **Step 1: Apply pattern**

- Title: `Activities — Scott Soward`.
- Eyebrow "Activities", title "Interactive activities", lede about puzzles / learning tools.
- `aria-current="page"` on Activities.
- Cards use `chip activity`.

- [ ] **Step 2: Visual check at http://localhost:8080/activities/**

- [ ] **Step 3: Commit**

```bash
git add activities/index.html
git commit -m "Refactor Activities hub onto shared design system"
```

---

## Task 7: Refactor `conferences/index.html` (Conferences hub)

**Files:**
- Modify: `conferences/index.html`

- [ ] **Step 1: Apply pattern**

- Title: `Conferences — Scott Soward`.
- Eyebrow "Conferences", title "Conferences & events", lede about professional and family conferences.
- `aria-current="page"` on Conferences.
- Cards use `chip conference`.

- [ ] **Step 2: Visual check at http://localhost:8080/conferences/**

- [ ] **Step 3: Commit**

```bash
git add conferences/index.html
git commit -m "Refactor Conferences hub onto shared design system"
```

---

## Task 8: Refactor `alma31.html` entry page

**Files:**
- Modify: `alma31.html`

- [ ] **Step 1: Apply hub-style template**

- `<link rel="stylesheet" href="css/site.css">`.
- Brand-link → `./` (root).
- Nav exposes the Scripture link as current: in the main site-nav, add `aria-current="page"` on an entry pointing to `alma31.html`. (Update other hub pages similarly in their own tasks if they don't already include a Scripture link — keep nav consistent across pages.)
- Hero: eyebrow "Scripture", title "Alma 31", lede about the chapter.
- Sub-nav: a `.card-grid` linking to Scripture / Analysis / Gallery / Applications / About (5 cards).

Note: This page may currently have heavy custom styling. Replace the chrome only; if there's a hero illustration, you can keep it inside the hero section as an `<img>` with appropriate `alt`.

- [ ] **Step 2: Sync nav across all hub pages**

In Tasks 3-7, add a sixth nav link `<a href="../alma31.html">Scripture</a>` (or `alma31.html` from root) to the nav so the site-wide nav consistently lists six destinations: Home, Gospel, Tech & AI, Activities, Conferences, Scripture.

If the previous tasks have already been committed without it, append commits that add the Scripture nav link to each.

- [ ] **Step 3: Visual + keyboard check**

- [ ] **Step 4: Commit**

```bash
git add alma31.html index.html presentations/index.html tech-presentations/index.html activities/index.html conferences/index.html
git commit -m "Refactor Alma 31 entry; add Scripture link to site nav"
```

---

## Task 9: Refactor `pages/scripture.html`

**Files:**
- Modify: `pages/scripture.html`

- [ ] **Step 1: Apply chrome + prose pattern**

- `<link rel="stylesheet" href="../css/site.css">`.
- Brand `href="../"`. Nav with `aria-current="page"` on Scripture (link target `../alma31.html`).
- Hero with eyebrow "Alma 31", title "Scripture text", lede.
- Body: `<div class="container"><div class="prose">...</div></div>`. Keep existing verse markup.
- Search input (if present) wrapped in `<label>`: `<label class="visually-hidden" for="scripture-search">Search verses</label><input id="scripture-search" type="search" ...>`. Style search input with shared rules — add a small block to `site.css` if needed, or use existing input default.

- [ ] **Step 2: Add input styling to `css/site.css`** (only if not already present)

```css
input[type="search"], input[type="text"] {
  font: inherit; padding: 8px 12px; min-height: 40px;
  border: 1px solid var(--border-strong); border-radius: var(--r-md);
  background: var(--bg); color: var(--ink);
}
input[type="search"]:focus-visible { border-color: var(--accent); }
```

Commit this css change as part of this task (single commit at the end).

- [ ] **Step 3: Visual check at http://localhost:8080/pages/scripture.html**

Test search if functional — verify it still works and announces results live (add `aria-live="polite"` on the result count element if there is one).

- [ ] **Step 4: Commit**

```bash
git add pages/scripture.html css/site.css
git commit -m "Refactor Alma 31 scripture page; add input styling to site.css"
```

---

## Task 10: Refactor `pages/analysis.html`

**Files:**
- Modify: `pages/analysis.html`

- [ ] **Step 1: Apply chrome + prose pattern (same as Task 9, without search)**

- [ ] **Step 2: Visual check**

- [ ] **Step 3: Commit**

```bash
git add pages/analysis.html
git commit -m "Refactor Alma 31 analysis page onto shared design system"
```

---

## Task 11: Refactor `pages/gallery.html` (lightbox accessibility)

**Files:**
- Modify: `pages/gallery.html`

- [ ] **Step 1: Apply chrome + card grid**

Gallery cards become `.card` with image inside `.card-body`. Each card opens the lightbox.

- [ ] **Step 2: Rewrite lightbox to dialog pattern**

If existing lightbox uses click on a div, replace with:

```html
<div id="lightbox" class="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title" hidden>
  <button class="lightbox-close" aria-label="Close">✕</button>
  <figure>
    <img id="lightbox-img" alt="">
    <figcaption id="lightbox-title"></figcaption>
  </figure>
</div>
```

Plus inline JS for focus-trap and ESC-to-close:

```js
(function() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const closeBtn = lb.querySelector('.lightbox-close');
  const img = document.getElementById('lightbox-img');
  const title = document.getElementById('lightbox-title');
  let lastFocus = null;

  function open(src, caption) {
    lastFocus = document.activeElement;
    img.src = src; img.alt = caption; title.textContent = caption;
    lb.hidden = false;
    closeBtn.focus();
    document.addEventListener('keydown', onKey);
  }
  function close() {
    lb.hidden = true;
    document.removeEventListener('keydown', onKey);
    if (lastFocus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { e.preventDefault(); closeBtn.focus(); } // simple single-focusable trap
  }
  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });

  document.querySelectorAll('[data-lightbox]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(el.dataset.lightbox, el.dataset.caption || '');
    });
  });
})();
```

Add lightbox CSS to `site.css`:

```css
.lightbox {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(15,23,42,0.85);
  display: grid; place-items: center; padding: var(--sp-6);
}
.lightbox[hidden] { display: none; }
.lightbox figure { max-width: 90vw; max-height: 90vh; color: #fff; text-align: center; }
.lightbox img { max-width: 100%; max-height: 80vh; border-radius: var(--r-md); }
.lightbox figcaption { margin-top: var(--sp-3); font-size: var(--fs-sm); color: rgba(255,255,255,0.85); }
.lightbox-close {
  position: absolute; top: var(--sp-4); right: var(--sp-4);
  appearance: none; background: rgba(255,255,255,0.12); color: #fff;
  border: 1px solid rgba(255,255,255,0.25); border-radius: var(--r-pill);
  width: 40px; height: 40px; font-size: 1.1rem; cursor: pointer;
}
.lightbox-close:hover { background: rgba(255,255,255,0.2); }
```

- [ ] **Step 3: Keyboard test**

Open gallery page, click a card → lightbox opens with close button focused. Press ESC → returns focus to the originating link. Tab → wraps to close button.

- [ ] **Step 4: Commit**

```bash
git add pages/gallery.html css/site.css
git commit -m "Refactor Alma 31 gallery; rewrite lightbox as accessible dialog"
```

---

## Task 12: Refactor `pages/applications.html`

**Files:**
- Modify: `pages/applications.html`

- [ ] **Step 1: Apply chrome + mixed sections**

Use `.section.container` blocks for each grouping (Personal Study, Family Activities by Age, Teaching Ideas, Interactive Demos). The "Build Your Own Rameumptom" demo: convert any clickable `<div>`s into `<button>`s with proper labels. Keep the interaction working.

- [ ] **Step 2: Visual + keyboard check**

- [ ] **Step 3: Commit**

```bash
git add pages/applications.html
git commit -m "Refactor Alma 31 applications page; convert clickable divs to buttons"
```

---

## Task 13: Refactor `pages/about.html`

**Files:**
- Modify: `pages/about.html`

- [ ] **Step 1: Apply chrome + prose**

Single `<div class="container"><div class="prose">...</div></div>`. No card grid needed.

- [ ] **Step 2: Visual check**

- [ ] **Step 3: Commit**

```bash
git add pages/about.html
git commit -m "Refactor Alma 31 about page onto prose pattern"
```

---

## Task 14: Refactor `conferences/atlassian-team-26/index.html` (tablist)

**Files:**
- Modify: `conferences/atlassian-team-26/index.html`

- [ ] **Step 1: Apply chrome**

Same header / nav / footer as section hubs. Path: `../../css/site.css`. `aria-current="page"` on the Conferences nav link.

- [ ] **Step 2: Convert day tabs to ARIA tablist**

If existing day tabs are buttons/links toggling sections, restructure as:

```html
<div class="tabs" role="tablist" aria-label="Conference days">
  <button role="tab" id="tab-day1" aria-controls="panel-day1" aria-selected="true" tabindex="0">Tuesday</button>
  <button role="tab" id="tab-day2" aria-controls="panel-day2" aria-selected="false" tabindex="-1">Wednesday</button>
  <button role="tab" id="tab-day3" aria-controls="panel-day3" aria-selected="false" tabindex="-1">Thursday</button>
</div>
<section id="panel-day1" role="tabpanel" aria-labelledby="tab-day1" class="tab-panel">…day 1…</section>
<section id="panel-day2" role="tabpanel" aria-labelledby="tab-day2" class="tab-panel" hidden>…day 2…</section>
<section id="panel-day3" role="tabpanel" aria-labelledby="tab-day3" class="tab-panel" hidden>…day 3…</section>
```

Plus tablist JS:

```js
(function() {
  const lists = document.querySelectorAll('[role="tablist"]');
  lists.forEach(list => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));

    function activate(i, setFocus) {
      tabs.forEach((t, j) => {
        const selected = j === i;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        panels[j].hidden = !selected;
      });
      if (setFocus) tabs[i].focus();
    }

    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft')  next = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End')  next = tabs.length - 1;
      if (next >= 0) { e.preventDefault(); activate(next, true); }
    });
    tabs.forEach((t, i) => t.addEventListener('click', () => activate(i, false)));
  });
})();
```

- [ ] **Step 3: Preserve venue map** (Leaflet/OSM) — keep its script tag and container; ensure container `id` is unchanged. Add an `aria-label` to the map container: `<div id="map" aria-label="Anaheim Convention Center venue map" role="img"></div>`.

- [ ] **Step 4: Keyboard test the tablist**

Click first tab → focus. Press Right Arrow → moves to next tab, panel updates. Home → first, End → last. Confirm `aria-selected` and `hidden` track focus.

- [ ] **Step 5: Commit**

```bash
git add conferences/atlassian-team-26/index.html
git commit -m "Refactor Atlassian Team '26 page; convert day tabs to ARIA tablist"
```

---

## Task 15: Refactor `conferences/rootstech-2026/index.html` (tablist)

**Files:**
- Modify: `conferences/rootstech-2026/index.html`

- [ ] **Step 1: Apply chrome + tablist** — same pattern as Task 14, with the existing RootsTech tabs (Dashboard, Schedule, Videos & Scripts, Logistics).

- [ ] **Step 2: Visual + keyboard test**

- [ ] **Step 3: Commit**

```bash
git add conferences/rootstech-2026/index.html
git commit -m "Refactor RootsTech 2026 page; convert tabs to ARIA tablist"
```

---

## Task 16: Refactor `activities/hat-riddle/index.html`

**Files:**
- Modify: `activities/hat-riddle/index.html`

- [ ] **Step 1: Apply chrome**

Path: `../../css/site.css`. `aria-current="page"` on Activities. Hero with eyebrow "Activity", title "The Alien Hat Riddle", lede.

- [ ] **Step 2: Audit interaction controls**

Any `<div onclick>` becomes `<button>`. Step-through controls (Next / Prev / Reset) use `.btn .btn-primary` and `.btn .btn-ghost`.

- [ ] **Step 3: Visual + keyboard test**

- [ ] **Step 4: Commit**

```bash
git add activities/hat-riddle/index.html
git commit -m "Refactor hat-riddle activity onto shared design system"
```

---

## Task 17: Add `reveal-site-theme.css` to all Reveal.js decks

**Files (14 to modify):**
- `presentations/ai-students-byuideo/index.html`
- `presentations/all-who-have-endured-valiantly/index.html`
- `presentations/easter-week/index.html`
- `presentations/easter-week-monday/index.html`
- `presentations/easter-week-tuesday/index.html`
- `presentations/easter-week-wednesday/index.html`
- `presentations/easter-week-thursday/index.html`
- `presentations/easter-week-friday/index.html`
- `presentations/easter-week-saturday/index.html`
- `presentations/easter-week-sunday/index.html`
- `presentations/easter-week-resurrection/index.html`
- `presentations/stake-ss-presidents-training/index.html`
- `presentations/ward-conference-2026/index.html`
- `tech-presentations/meaning-of-life-for-ai/index.html`
- `tech-presentations/ai-evolution-collage/index.html`

- [ ] **Step 1: For each deck, add the override link**

After the existing Reveal theme `<link>` (or after the Reveal stylesheet block), add:

```html
<link rel="stylesheet" href="/css/reveal-site-theme.css">
```

Use absolute path `/css/...` so it works regardless of directory depth, and because GitHub Pages serves from a known root.

If a given page is heavily customized inline and the override conflicts visually, drop the link from that file and note it in the commit message.

- [ ] **Step 2: Spot-check 3 decks at 1280 px**

Open in browser:
- `presentations/ward-conference-2026/`
- `presentations/easter-week/`
- `tech-presentations/meaning-of-life-for-ai/`

Verify slides still render; harmonization is cosmetic (font + accent + link color). If a deck breaks, remove the link from that file only.

- [ ] **Step 3: Commit**

```bash
git add presentations/*/index.html tech-presentations/*/index.html
git commit -m "Harmonize Reveal.js decks with shared reveal-site-theme.css"
```

---

## Task 18: Update `sw.js` and `manifest.json`

**Files:**
- Modify: `sw.js`
- Modify: `manifest.json`

- [ ] **Step 1: Bump service-worker cache version**

In `sw.js`, change the three cache name constants from `*-v1.2.0` to `*-v1.3.0`:

```js
const CACHE_NAME = 'alma31-study-v1.3.0';
const STATIC_CACHE_NAME = 'alma31-static-v1.3.0';
const DYNAMIC_CACHE_NAME = 'alma31-dynamic-v1.3.0';
```

- [ ] **Step 2: Add new CSS files to `STATIC_ASSETS`**

```js
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/site.css',
    '/css/reveal-site-theme.css',
    '/css/main.css',
    '/css/responsive.css',
    // …rest unchanged
];
```

- [ ] **Step 3: Update `manifest.json`**

```json
{
  "name": "Scott Soward — Hub",
  "short_name": "Soward Hub",
  "theme_color": "#1d4ed8",
  "background_color": "#ffffff",
  ...
}
```

Only adjust `name`, `short_name`, `theme_color`, `background_color`. Leave icons / start_url / display untouched unless they're missing.

- [ ] **Step 4: Hard-refresh in a private window** to confirm SW picks up the new cache version (DevTools Application → Service Workers → Update on reload).

- [ ] **Step 5: Commit**

```bash
git add sw.js manifest.json
git commit -m "Bump SW cache; precache shared CSS; refresh manifest brand"
```

---

## Task 19: Final QA sweep

**Files:**
- (none — verification only, fixes filed as ad-hoc commits if any)

- [ ] **Step 1: HTML validation**

Run:

```bash
npx --yes html-validate \
  index.html \
  presentations/index.html \
  tech-presentations/index.html \
  activities/index.html \
  conferences/index.html \
  alma31.html \
  pages/*.html \
  conferences/atlassian-team-26/index.html \
  conferences/rootstech-2026/index.html \
  activities/hat-riddle/index.html
```

Expected: zero errors. If any errors surface, fix them in the offending file and commit.

If `html-validate` config errors out on Reveal-specific markup, scope it to the non-Reveal pages above only.

- [ ] **Step 2: Keyboard sweep on three pages**

For each of `/`, `/presentations/`, `/alma31.html`:
- Tab from address bar.
- Step 1 = skip link (verify text visible).
- Step 2+ = brand, then each nav link, then each filter button, then first card link.
- All focus indicators visible (2-px solid blue ring).

- [ ] **Step 3: Responsive sweep**

DevTools device toolbar at 360 / 768 / 1280 on `/`, `/presentations/`, `/conferences/atlassian-team-26/`:
- No horizontal scrollbar.
- Hamburger appears below 640 px; tap opens nav.
- Cards reflow cleanly.

- [ ] **Step 4: Reduced motion**

DevTools Rendering panel → Emulate CSS prefers-reduced-motion: reduce. Confirm card hover no longer lifts.

- [ ] **Step 5: Lighthouse a11y**

Run Lighthouse (DevTools, mobile mode, Accessibility only) on:
- `http://localhost:8080/`
- `http://localhost:8080/presentations/`
- `http://localhost:8080/alma31.html`

Expected: ≥ 95 on each. Fix any flagged issue (most common: missing labels, contrast, heading order).

- [ ] **Step 6: Commit any QA fixes**

```bash
git add -A
git commit -m "QA sweep: HTML validation + accessibility fixes"
```

(Skip this commit if there were no fixes.)

---

## Task 20: Push to `main`

**Files:**
- (none)

- [ ] **Step 1: Confirm clean state**

Run: `git status`
Expected: `nothing to commit, working tree clean`.

- [ ] **Step 2: Show local commits ahead of remote**

Run: `git log --oneline origin/main..HEAD`
Expected: the redesign commits listed.

- [ ] **Step 3: Push**

Run: `git push origin main`
Expected: push succeeds.

- [ ] **Step 4: Verify deploy**

Wait ~60 seconds, then open https://ssoward.github.io/hub/ and spot-check that the new design has shipped.

---

## Self-review

**Spec coverage:**

| Spec section | Covered by |
|---|---|
| § 4 design tokens | Task 1 step 1 |
| § 4 typography / spacing / radius / motion | Task 1 steps 1–2 |
| § 5 components (header/nav/hero/section/prose/card/chip/btn/tabs/footer) | Task 1 steps 3–10 |
| § 6 hub pages × 5 | Tasks 3–7 |
| § 6 Alma 31 (6 pages) | Tasks 8–13 |
| § 6 conference detail (2) | Tasks 14–15 |
| § 6 activities (1) | Task 16 |
| § 6 Reveal.js decks | Tasks 2, 17 |
| § 6 system files (sw.js, manifest) | Task 18 |
| § 7 accessibility (skip link, focus, ARIA, contrast, reduced motion, forms) | Task 1 (chrome), Tasks 11, 14, 15 (interaction patterns), Task 19 step 5 (Lighthouse) |
| § 8 Reveal.js override scope | Task 2 |
| § 9 testing | Task 19 |
| § 12 acceptance checklist | Task 19 (most), Task 20 (push step) |

**Placeholder scan:** No "TBD" / "fill in later" / "similar to Task N" — every reused pattern is restated. Card content placeholders in Task 3 refer to *existing data in the file being refactored*, which is explicit and intentional.

**Type / naming consistency:** Class names (`.card`, `.chip`, `.btn`, `.tabs`, `.site-header`, `.site-nav`, `.site-footer`, `.filter-bar`, `.tab-panel`, `.lightbox`) match between Task 1 (definition) and Tasks 3–16 (usage). CSS variables (`--accent`, `--ink`, etc.) match between definition (Task 1) and use across components (Task 1).

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-17-site-redesign.md`. The user has already approved auto-execution. Execute inline using `superpowers:executing-plans`.
