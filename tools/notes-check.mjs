/**
 * The notes pages, and the way home reaches them.
 *
 *   node tools/notes-check.mjs
 *
 * A note is prose, so there is no game logic to exercise. What can break is the
 * wiring: the home card and its filter, the in-page table of contents, the link
 * to the source markdown, and the layout on a phone.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, REPO_ROOT } from './browser-harness.mjs';

const NOTES = readdirSync(join(REPO_ROOT, 'notes'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

runSuite(`${NOTES.length} note${NOTES.length === 1 ? '' : 's'}`, async (t) => {
  // ------------------------------------------------------------ home page

  await t.open('/', `return !!document.getElementById('cards')`);

  const linked = await t.eval(`
    return [...document.querySelectorAll('#cards a[href^="notes/"]')]
      .map(a => a.getAttribute('href').replace(/^notes\\//, '').replace(/\\/$/, ''));`);
  for (const name of NOTES) {
    t.check(linked.includes(name), `${name} is linked from the home page`);
  }

  t.check(await t.eval(`
    const btn = document.querySelector('.filter-bar [data-filter="notes"]');
    if (!btn) return false;
    btn.click();
    const cards = [...document.querySelectorAll('#cards .card')];
    const shown = cards.filter(c => !c.hidden);
    return shown.length > 0 &&
      shown.every(c => (c.getAttribute('data-tags') || '').split(/\\s+/).includes('notes'));`),
    'the Notes filter shows the notes and nothing else');

  // ----------------------------------------------------------- each note

  for (const name of NOTES) {
    await t.open(`/notes/${name}/`);

    const page = await t.eval(`
      return {
        title: document.title,
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
        main: !!document.getElementById('main'),
        skip: !!document.querySelector('.skip-link'),
        nav: document.querySelectorAll('#primary-nav a').length,
        back: !!document.querySelector('.site-footer a[href="../../"]'),
        viewport: !!document.querySelector('meta[name=viewport]'),
        description: !!document.querySelector('meta[name=description]')
      };`);

    t.check(!!page.h1 && page.main && page.skip && page.nav === 6 && page.back &&
      page.viewport && page.description,
      `${name} carries the shared page furniture`, JSON.stringify(page));
    t.check(page.title.includes('Scott Soward'), `${name} has a site title`, page.title);

    const anchors = await t.eval(`
      return [...document.querySelectorAll('a[href^="#"]')]
        .map(a => a.getAttribute('href').slice(1))
        .filter(id => id && !document.getElementById(id));`);
    t.check(anchors.length === 0, `${name} has no dead in-page links`, anchors.join(', '));

    const sources = await t.eval(`
      const links = [...document.querySelectorAll('a[href$=".md"]')]
        .map(a => a.getAttribute('href'));
      const checked = [];
      for (const href of links) {
        const res = await fetch(new URL(href, location.href));
        checked.push(href + ' ' + res.status);
      }
      return { count: links.length, checked };`);
    t.check(sources.count > 0 && sources.checked.every(c => c.endsWith(' 200')),
      `${name} links to source notes that exist`, JSON.stringify(sources));

    await t.phone();
    const w = await t.eval(`return [document.documentElement.scrollWidth, window.innerWidth];`);
    t.check(w[0] <= w[1] + 1, `${name} has no horizontal scroll at phone width`, w.join(' vs '));
    await t.desktop();
  }
});
