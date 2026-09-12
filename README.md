# Gospel Study & Presentations Hub

A static web application serving as a personal hub for gospel study, tech presentations, interactive activities, and conference schedules.

## View Online

**Live site**: https://ssoward.github.io/hub/

| Section | URL |
|---------|-----|
| Home | https://ssoward.github.io/hub/ |
| Gospel Presentations | https://ssoward.github.io/hub/presentations/ |
| Tech & Philosophy | https://ssoward.github.io/hub/tech-presentations/ |
| Activities | https://ssoward.github.io/hub/activities/ |
| Conferences | https://ssoward.github.io/hub/conferences/ |
| Ham Radio Exam Trainer | https://ssoward.github.io/hub/ham-radio/ |

## Site Sections

### Ham Radio Exam Trainer
Flash cards and full-length practice exams for the FCC amateur radio licenses —
the complete current Technician (2026-2030), General (2023-2027), and Amateur
Extra (2024-2028) question pools from the NCVEC, 1,431 questions with all 14
diagrams. Spaced repetition by Leitner box, exams drawn one question per
question group the way the real ones are, and a searchable view of the whole
pool. See [ham-radio/README.md](ham-radio/README.md) for how the pools are
rebuilt when they roll over.

```bash
npm run ham:build      # refetch and rebuild the pools from ncvec.org
npm run ham:test       # validate the data, then drive the page in headless Chrome
```

### Gospel Presentations
Stake and ward-level teaching resources built with Reveal.js:
- Light, Truth, and Grace (Richard D. Draper, BYU 2009 — light as capacity, truth as the glorifying principle, grace as unconditional)
- The Olive Leaf — Doctrine and Covenants 88 (deep scripture study; light, law, kingdoms, the seven trumps, the house of learning)
- Maggie's Miracle — But Did You Die? (family testimony; cardiac arrest, CPR, and recovery — photos from butdidyoudie.life)
- Throwing the Door Wide Open (Camille N. Johnson)
- Do Not Miss the Majesty of This Moment (temple growth under Pres. Nelson)
- Ward Sunday School Presidents Training
- Ward Conference 2026 (PMG vs. Teaching in the Savior's Way)
- Confidence in the Presence of God (Pres. Nelson)
- AI in the Tech Industry — BYU Idaho students
- Easter Week Art Display (8-day Holy Week series)
- All Who Have Endured Valiantly (Elder Bednar)

### Tech & Philosophy
Interactive presentations on technology and AI:
- Utility Management Hub (industry data & platform deck)
- The Meaning of Life for AI (15-slide Reveal.js)
- A Day in the Life of AI (canvas animation)
- The Evolution of AI (7-era interactive gallery)

### Activities
Logic puzzles, arcade games, and interactive learning tools — 18 in all, including:
- The Alien Hat Riddle (step-by-step simulation)
- Sudoku, Minesweeper, Connect Four, Dots and Boxes, Slide Puzzle, Code Breaker
- Snake, Pong, Whack-a-Mole, Blackjack, Memory Match, Hangman, Word Guess, Quick Math, Tic-Tac-Toe, Rock Paper Scissors
- Scoreboard — a tap-to-score board for any game away from the screen

### Scripture
- Alma 31 Study App — full text, analysis, gallery, and study tools

### Study Analyses
Long-form written analyses in `analyses/`, used as source material for the decks:
- `draper-light-truth-grace-analysis.md` — Richard D. Draper, "Light, Truth, and Grace": the grace → light → truth → glory architecture, the Webster's 1828 lexical argument, and an interpretive seam in the talk
- `dc-88-olive-leaf-analysis.md` — Doctrine and Covenants 88: textual profile, five-movement structure, primary/secondary/tertiary points, literary devices, teaching applications
- `bednar-endure-valiantly-analysis.md` — Elder Bednar, "All Who Have Endured Valiantly"

### Conferences
Hub for professional and family conference schedules and coordination tools:
- **Atlassian Team '26** (May 5–7, 2026 · Anaheim) — personalized 3-day agenda, day tabs, priority ratings, conflict warnings, tips, interactive venue map (Leaflet/OSM) with markers for convention center, hotel, and pickleball courts
- **RootsTech 2026** (Mar 6–8, 2026 · Salt Lake City) — full production coordination dashboard for the FamilySearch GMC/Interactive TV team; tabs for Dashboard, Schedule, Videos & Scripts, and Logistics

## Project Structure

```
church/
├── index.html                    # Home hub (card grid with category filter)
├── presentations/
│   ├── index.html                # Gospel presentations hub
│   └── <name>/index.html         # Individual Reveal.js presentations
├── tech-presentations/
│   ├── index.html                # Tech & philosophy hub
│   └── <name>/index.html         # Individual presentations
├── activities/
│   ├── index.html                # Activities hub
│   └── <name>/index.html         # Individual activities
├── conferences/
│   ├── index.html                # Conferences hub (card listing)
│   ├── atlassian-team-26/        # Atlassian Team '26 personal agenda + map
│   └── rootstech-2026/           # RootsTech 2026 coordination dashboard
├── pages/                        # Alma 31 study sub-pages
├── analyses/                     # Long-form study analyses (Markdown)
├── css/                          # Shared stylesheets
├── js/                           # Shared JavaScript
├── assets/                       # Images and icons
├── alma31.html                   # Alma 31 study app entry point
├── manifest.json                 # PWA manifest
└── sw.js                         # Service worker
```

## Development

```bash
# Start local server
npm start
# Opens at http://localhost:8080
```

The site is pure static HTML/CSS/JS — no build step required. Each page is self-contained with inline styles.

## Deployment

Deployed via GitHub Pages from the `main` branch. Push to `main` triggers auto-deploy.

```bash
git push origin main
```

## Design System

All pages share a consistent design language:
- **Font**: system-ui stack (Apple/Segoe/Roboto)
- **Background**: `#fafaf8` (off-white)
- **Cards**: white, `border-radius: 12px`, soft shadow, 7px color banner
- **Nav**: sticky white pill-link bar
- **Category colors**: Blue (Gospel), Purple (Tech), Teal (Activity), Brown (Scripture), Orange (Conferences)
- **Responsive**: CSS Grid `auto-fill minmax(320px, 1fr)`, mobile-first

---

*Israel Canyon Saratoga Springs Stake · The Church of Jesus Christ of Latter-day Saints*
