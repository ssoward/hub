# Ham Radio Exam Trainer

Flash cards and full-length practice exams for the three FCC amateur radio
license exams, served as static files at
[/hub/ham-radio/](https://ssoward.github.io/hub/ham-radio/).

```
index.html          the page
ham.css / ham.js    styles and app (no framework, no build step)
data/*.json         the question pools
figures/*.png       the NCVEC diagrams, one PNG per figure
tools/              rebuild the data, validate it, and drive the page in Chrome
```

## What it does

- **Flash cards** — a Leitner-box scheduler (boxes 0–5, mastered at 4 right in a
  row) draws low boxes and unseen questions more often. Decks can be scoped to
  the whole pool, one subelement, or one question group, and filtered to unseen,
  repeatedly missed, or starred questions.
- **Practice exam** — built the way a real one is: one question drawn at random
  from each question group (35 for Technician and General, 50 for Extra), with
  the four choices shuffled. Grading gives the pass/fail verdict against the
  real passing mark, a per-subelement breakdown, and a review of every miss.
- **Browse the pool** — every question with its answer marked, searchable by
  text or question number, grouped by subelement and question group.

Progress and exam history live in `localStorage` under `hamradio.v1`; nothing
is sent anywhere.

## Where the questions come from

The [NCVEC Question Pool Committee](https://ncvec.org/index.php/amateur-question-pools)
publishes each pool as a Word document plus a PDF of the diagrams, and the
questions are reproduced verbatim — including the FCC Part 97 citations.

| Class | Pool | Valid | Questions | Exam |
|---|---|---|---|---|
| Technician (Element 2) | 2026–2030 | Jul 1, 2026 – Jun 30, 2030 | 409 | 35, pass 26 |
| General (Element 3) | 2023–2027 | Jul 1, 2023 – Jun 30, 2027 | 423 | 35, pass 26 |
| Amateur Extra (Element 4) | 2024–2028 | Jul 1, 2024 – Jun 30, 2028 | 599 | 50, pass 37 |

Question numbers are never reused after a withdrawal, so the numbering has
permanent holes where the NCVEC has deleted a question (9 in General, 4 in
Extra); `tools/validate_pools.py` knows about each one.

## Rebuilding when a pool rolls over

Pools are replaced on a four-year cycle — General in 2027, Extra in 2028,
Technician in 2030. Update the URLs and metadata in `POOLS` at the top of
`tools/build_pools.py`, then:

```bash
python3 ham-radio/tools/build_pools.py      # fetch, parse, crop figures
python3 ham-radio/tools/validate_pools.py   # structural checks on the data
node    ham-radio/tools/smoke-test.mjs      # drive the page in headless Chrome
```

`build_pools.py` needs Pillow and `pdftoppm` (`brew install poppler`);
`smoke-test.mjs` needs Google Chrome and no npm packages at all.

The page fetches its JSON over HTTP, so open it through a server
(`npm start`, then <http://localhost:8080/ham-radio/>) rather than from the
filesystem.
