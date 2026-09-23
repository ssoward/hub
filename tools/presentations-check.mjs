/**
 * The gospel presentations, and the way home reaches them.
 *
 *   node tools/presentations-check.mjs
 *
 * A deck is prose on slides, so there is no game logic to exercise. What can
 * break is the wiring: the home card and its filter, the card links on the
 * gospel index, and — for each Reveal.js deck — whether Reveal actually boots,
 * how many slides it built, and whether the speaker notes survived.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, REPO_ROOT } from './browser-harness.mjs';

// Reveal decks: presentation directories whose page loads ../reveal/dist/reveal.js
const DECKS = readdirSync(join(REPO_ROOT, 'presentations'), { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'reveal')
  .map(d => d.name)
  .filter(name => {
    const page = join(REPO_ROOT, 'presentations', name, 'index.html');
    return existsSync(page) && readFileSync(page, 'utf8').includes('reveal/dist/reveal.js');
  })
  .sort();

runSuite(`${DECKS.length} presentation deck${DECKS.length === 1 ? '' : 's'}`, async (t) => {
  // ------------------------------------------------------------ home page

  await t.open('/', `return !!document.getElementById('cards')`);

  t.check(await t.eval(`
    return !!document.querySelector('#cards a[href="presentations/wherefore-can-ye-doubt/"]');`),
    'wherefore-can-ye-doubt is linked from the home page');

  t.check(await t.eval(`
    const btn = document.querySelector('.filter-bar [data-filter="gospel"]');
    if (!btn) return false;
    btn.click();
    const cards = [...document.querySelectorAll('#cards .card')];
    const shown = cards.filter(c => !c.hidden);
    return shown.length > 0 &&
      shown.every(c => (c.getAttribute('data-tags') || '').split(/\\s+/).includes('gospel'));`),
    'the Gospel filter shows the gospel cards and nothing else');

  // --------------------------------------------------------- gospel index

  await t.open('/presentations/');

  const cardLinks = await t.eval(`
    const links = [...document.querySelectorAll('.card-footer a[href^="./"]')]
      .map(a => a.getAttribute('href'));
    const checked = [];
    for (const href of links) {
      const res = await fetch(new URL(href, location.href));
      checked.push(href + ' ' + res.status);
    }
    return { count: links.length, checked };`);
  t.check(cardLinks.count > 0 && cardLinks.checked.every(c => c.endsWith(' 200')),
    'every card on the gospel index links to a page that exists',
    JSON.stringify(cardLinks.checked.filter(c => !c.endsWith(' 200'))));

  t.check(await t.eval(`
    return !!document.querySelector('a[href="./wherefore-can-ye-doubt/"]');`),
    'wherefore-can-ye-doubt is linked from the gospel index');

  // ------------------------------------------------------------ each deck

  for (const name of DECKS) {
    await t.open(`/presentations/${name}/`,
      `return typeof Reveal !== 'undefined' && Reveal.isReady()`);

    const deck = await t.eval(`
      return {
        title: document.title,
        slides: document.querySelectorAll('.reveal .slides > section').length,
        notes: document.querySelectorAll('.reveal .slides > section aside.notes').length,
        viewport: !!document.querySelector('meta[name=viewport]')
      };`);

    t.check(deck.slides > 0, `${name} built its slides`, JSON.stringify(deck));
    t.check(!!deck.title && deck.viewport, `${name} has a title and viewport`, deck.title);
  }

  // The new deck, in detail.

  await t.open('/presentations/wherefore-can-ye-doubt/',
    `return typeof Reveal !== 'undefined' && Reveal.isReady()`);

  t.check(await t.eval(`return Reveal.getTotalSlides() === 16`),
    'the 1 Nephi 4 × Oaks deck has its 16 slides',
    String(await t.eval(`return Reveal.getTotalSlides()`)));

  t.check(await t.eval(`
    const slides = document.querySelectorAll('.reveal .slides > section').length;
    const notes = document.querySelectorAll('.reveal .slides > section aside.notes').length;
    return slides === notes;`),
    'the deck carries speaker notes on every slide');

  t.check(await t.eval(`
    const text = document.querySelector('.reveal .slides').textContent;
    return text.includes('Wherefore Can') &&
      text.includes('not knowing beforehand') &&
      text.includes('Zoram did take courage');`),
    'the deck quotes 1 Nephi 4 where it says it does');

  // Arrow key advances the deck — Reveal is actually interactive, not just parsed.
  await t.key('ArrowRight', 'ArrowRight', 39);
  await t.sleep(400);
  t.check(await t.eval(`return Reveal.getIndices().h === 1`),
    'the deck advances on arrow key');
});
