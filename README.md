# Scott Soward — Hub

A static site that collects the things I build: conference dashboards, tech and
gospel presentations, a scripture study app, study tools, and a small arcade of
games. Plain HTML, CSS and JavaScript — no framework, no build step, no npm
dependencies — deployed to GitHub Pages.

**Live site:** https://ssoward.github.io/hub/

| Section | URL |
|---------|-----|
| Home (search + filters over everything) | https://ssoward.github.io/hub/ |
| Conferences | https://ssoward.github.io/hub/conferences/ |
| Tech & AI | https://ssoward.github.io/hub/tech-presentations/ |
| Gospel presentations | https://ssoward.github.io/hub/presentations/ |
| Scripture (Alma 31) | https://ssoward.github.io/hub/alma31.html |
| Study tools (Ham Radio Exam Trainer) | https://ssoward.github.io/hub/ham-radio/ |
| Activities | https://ssoward.github.io/hub/activities/ |
| Notes | https://ssoward.github.io/hub/notes/training-to-age-better/ |

## Quick start

```bash
npm start              # serves the repo at http://localhost:8080
npm test               # every test suite (needs Google Chrome)
npm run test:site      # just the fast static checks (no browser, ~1s)
```

The browser tests drive headless Chrome over the DevTools protocol using
`tools/browser-harness.mjs`. They look for Chrome at the usual macOS path; set
`CHROME=/path/to/chrome` anywhere else.

## Design system (v2, November 2026)

Every hub page shares one stylesheet, one script and one header/footer.

| Piece | File | What it does |
|-------|------|--------------|
| Tokens + components | `css/site.css` | Colors, type scale, spacing, radii; header, nav, breadcrumbs, hero, cards, tiles, chips, buttons, toolbar, tabs, segmented control, panels, callouts, stats, disclosures, tables, timelines |
| Behavior | `js/site.js` | Theme toggle, mobile menu, ARIA tabs, search + filter collections, footer year |
| Shared chrome | `tools/site-chrome.mjs` | Writes the identical header, footer and `<head>` wiring into every page |

**Principles**

- **One accent, neutral surfaces.** Category color appears only on small chips,
  never on whole cards. Status chips mark events *Upcoming*, *Planning* or *Past*.
- **Cards are one tap target.** The title is the card's only link and stretches
  over the whole card (`.card-link`), so screen readers hear a descriptive
  link name instead of a row of identical "Open →" buttons.
- **Mobile first.** No sideways scroll from 320px up; the nav collapses into a
  full-width menu below 920px with 48px rows; tables collapse into stacked
  cards below 720px (`.table-stack`); tab rows scroll horizontally and stick
  under the header.
- **Accessible by default.** Skip link, landmarks, one `<h1>` per page with no
  skipped heading levels, WAI-ARIA tabs with arrow-key support, native
  `<details>` for expanders, visible focus rings, WCAG AA contrast in both themes.
- **Dark mode is opt-in per page.** A page that has been checked in dark mode
  marks `<html data-theme-support>`; it then follows the OS setting or the
  header toggle (remembered per device). Pages without the attribute (the games,
  ham radio, Alma 31) always render light because they still carry hardcoded
  light colors. A page designed for one theme can pin it with
  `data-theme-lock="dark"` (the hat riddle does).

### Adding a page

1. Copy the nearest sibling page (an index page for a section, a dashboard for
   an event). Link `css/site.css` and include
   `<header class="site-header"></header>` after the skip link and
   `<main id="main">`.
2. Run `npm run chrome` (`node tools/site-chrome.mjs`). It fills in the header,
   footer and `<head>` wiring, sets the active nav item, and adds the footer
   back-link to the section.
3. Add a card for it on the section index **and** on the home page:

   ```html
   <article class="card" data-tags="tech">
     <div class="card-body">
       <div class="card-top"><span class="chip tech">Tech &amp; AI</span></div>
       <h3 class="card-title"><a class="card-link" href="tech-presentations/my-talk/">My talk</a></h3>
       <p class="card-text">One or two sentences about it.</p>
     </div>
     <div class="card-footer">
       <span class="card-meta">12 slides · Reveal.js</span>
       <span class="card-cta" aria-hidden="true">Open</span>
     </div>
   </article>
   ```

   `data-tags` drives the home filters; `data-keywords="…"` adds search terms
   that aren't on the card. Update the section tile count on the home page —
   `npm run test:site` fails if it's wrong.
4. If the page is checked in dark mode, add `data-theme-support` to `<html>`.
5. Run `npm test` before you push.

To change the nav or footer for every page at once, edit `NAV` or the
templates in `tools/site-chrome.mjs` and run `npm run chrome`.

## Tests

| Command | What it checks | Time |
|---------|----------------|------|
| `npm run test:site` | **Static, no browser.** Every page: `lang`, charset, viewport, title; local links and assets resolve; no duplicate ids; no broken HTML entities printed as text; images have `alt`. Hub pages also: header/footer in sync with `site-chrome.mjs`; exactly one `<h1>`; no skipped heading levels; no `onclick` on non-buttons; in-page anchors and ARIA references resolve; each card has one named link. Home tile counts match the section pages. Pages under `/private/` must be ciphertext only. Every service-worker precache entry exists. | ~1s |
| `npm run test:a11y` | **Headless Chrome, every hub page at 375px and 1280px, light and dark.** One `<main>`, banner and labelled nav; every visible control has an accessible name; text contrast meets WCAG AA. Then drives the shared behavior: skip link is the first Tab stop; phone menu opens, closes on Escape and outside click, returns focus, has 44px rows; theme toggle follows the OS, switches, persists across pages, and stays off on light-only pages; every tablist switches by click and arrow keys with a roving tabindex; home search, filters, URL deep links, result count, empty state and reset; clicking anywhere on a card hits its link. | ~1 min |
| `npm run test:activities` | Loads every activity, fails on console errors or failed requests, checks phone layout and shared page furniture, and that the index links it. | ~30s |
| `npm run test:<game>` | Per-game rule suites (chess is checked against published perft node counts). | seconds |
| `npm run test:notes`, `test:presentations` | Notes pages and decks load cleanly and are linked. | seconds |
| `npm run test:responsive` | Every page at 320, 375, 414, 768, 1024 and 1280px: fails on sideways scroll or content past the screen edge; lists small text and tap targets. `ONLY=conferences npm run test:responsive` narrows it. | ~4 min |
| `npm run ham:test` | Validates the ham radio question pools, then drives the trainer. | ~20s |

`npm test` runs everything except the responsive audit and ham radio. CI
(`.github/workflows/test.yml`) runs `npm test` on every pull request and push
to `main`; deploys are a separate workflow (`deploy.yml`).

## Site sections

### Conferences
Coordination dashboards and trip plans. Past events stay as a reference.
- **RootsTech 2027** (Mar 4–6, 2027 · Salt Lake City) — RootsTech Studio
  dashboard: open action items, staffing plan and HR shift model, history,
  carry-forward notes from 2026. Candidate names for staffing live in
  Confluence (internal), never on this public page.
- **AI Engineer NYC 2026** (Oct 12–14, 2026 · New York) — before/during/after
  checklists, day-by-day timeline, the full session schedule with search,
  suggested talks and stars. A separate **private itinerary** is published
  encrypted at `conferences/aie-nyc-2026/private/` (see below).
- **Atlassian Team '26** (May 5–7, 2026 · Anaheim) — personal 3-day agenda with
  priorities, conflict warnings, tips and a Leaflet/OpenStreetMap venue map.
- **RootsTech 2026** (Mar 5–7, 2026 · Salt Lake City) — the full studio
  production dashboard: keynotes, five-day studio schedule, the nine-video B-roll
  package with scripts and filming orders, and logistics.

Public conference pages carry no personal travel details (flights, hotels,
departure times). Those belong in a private, encrypted page.

### Tech & AI
- Utility Management Hub (industry data & platform deck)
- The Meaning of Life for AI (15-slide Reveal.js)
- A Day in the Life of AI (canvas animation)
- The Evolution of AI (7-era interactive gallery)

### Gospel presentations
Stake and ward teaching resources built with Reveal.js:
- Wherefore Can Ye Doubt? (1 Nephi 4 × President Oaks, BYU 2026)
- Light, Truth, and Grace (Richard D. Draper, BYU 2009)
- The Olive Leaf — Doctrine and Covenants 88
- Maggie's Miracle — But Did You Die? (family testimony)
- Throwing the Door Wide Open (Camille N. Johnson)
- Do Not Miss the Majesty of This Moment (temple growth under President Nelson)
- Ward Sunday School Presidents Training
- Ward Conference 2026 (PMG vs. Teaching in the Savior's Way)
- Confidence in the Presence of God (President Nelson)
- AI in the Tech Industry — BYU-Idaho students
- Easter Week Art Display (8-day Holy Week series)
- All Who Have Endured Valiantly (Elder Bednar)

Decks scale as a whole and keep their own Reveal.js themes, harmonized through
`css/reveal-site-theme.css`; they don't use the hub header.

Long-form written analyses used as source material for the decks live in
`analyses/`.

### Scripture
- Alma 31 Study App — full text, analysis, gallery, and study applications.

### Study tools
**Ham Radio Exam Trainer** — flash cards and full-length practice exams for the
FCC amateur radio licenses: the complete current Technician (2026–2030), General
(2023–2027) and Amateur Extra (2024–2028) pools from the NCVEC, 1,431 questions
with all 14 diagrams, Leitner-box spaced repetition, exams drawn one question per
group. See [ham-radio/README.md](ham-radio/README.md) for rebuilding the pools.

```bash
npm run ham:build      # refetch and rebuild the pools from ncvec.org
npm run ham:test       # validate the data, then drive the page in headless Chrome
```

### Notes
Long-form reading notes, one directory per note, with the Markdown it was
written from next to the page.
- Training to Age Better (Buck Institute podcast #04 — Gordon Lithgow and
  Rhonda Patrick on micronutrients, vitamin D, hormesis, sauna and cold, chronic
  stress, and aging research).

### Activities
22 games and puzzles, all keyboard- and touch-friendly: Chess (full rules, three
computer strengths), Sudoku, Minesweeper, Connect Four, Dots and Boxes, Slide
Puzzle, Code Breaker, Snake, Pong, Whack-a-Mole, Blackjack, Memory Match,
Hangman, Word Guess, Quick Math, Tic-Tac-Toe, Rock Paper Scissors, 2048, Simon,
Lights Out, the Alien Hat Riddle, and a Scoreboard for games away from the screen.

## Password-protected pages
GitHub Pages can't password-protect a URL, so a private page is published as
ciphertext. `tools/encrypt-page.mjs` encrypts a standalone HTML file with
AES-256-GCM (key from PBKDF2-SHA256, 600,000 iterations, random salt and IV) and
writes a page holding only the ciphertext and an unlock form; the browser
decrypts it locally with WebCrypto. `npm run test:site` fails if any page under
a `/private/` folder contains plaintext content.

```bash
node tools/encrypt-page.mjs <plain.html> <out.html> <password-file>
```

Keep the plaintext page and the password file **outside** the repo and never
commit them. Anyone can download the ciphertext and guess offline, so use a long
random password.

## Project structure

```
hub/
├── index.html                 # Home: intro, up-next, section tiles, searchable grid
├── css/site.css               # Design system (tokens + components)
├── js/site.js                 # Shared behavior (theme, menu, tabs, collections)
├── conferences/
│   ├── index.html             # Upcoming + past events
│   ├── rootstech-2027/        # Studio planning dashboard
│   ├── aie-nyc-2026/          # Trip plan (+ private/ — ciphertext only)
│   ├── atlassian-team-26/     # Agenda + venue map
│   └── rootstech-2026/        # Archived studio dashboard
├── tech-presentations/        # Tech & AI index + pieces
├── presentations/             # Gospel index + Reveal.js decks
├── alma31.html, pages/        # Alma 31 study app
├── ham-radio/                 # Ham Radio Exam Trainer
├── notes/                     # Reading notes
├── activities/                # Games index + 22 games
├── analyses/                  # Long-form study analyses (Markdown)
├── telluride-loan/            # Standalone page (own design; not in the hub nav)
├── tools/                     # site-chrome, site-check, a11y-audit, harness,
│                              #   responsive audit, page encryption
├── assets/                    # Icons and images
├── manifest.json, sw.js       # PWA manifest and service worker
└── .github/workflows/         # deploy.yml (Pages), test.yml (CI)
```

## Deployment

GitHub Pages deploys `main` automatically (`.github/workflows/deploy.yml`).
When you change a precached file's name or add a shared asset, bump the cache
version at the top of `sw.js` so returning visitors don't keep stale files.
