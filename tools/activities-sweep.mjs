/**
 * A sweep across every activity page.
 *
 *   node tools/activities-sweep.mjs
 *
 * Eight activities have their own smoke test covering their rules. This is the
 * floor under all of them: each page loads without a console error or a failed
 * request, lays out inside a phone viewport, carries the shared furniture, and
 * is reachable from the activities index. It is what catches a shared CSS or
 * navigation change breaking a game nobody has a suite for yet.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, REPO_ROOT } from './browser-harness.mjs';

const ACTIVITIES = readdirSync(join(REPO_ROOT, 'activities'), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

runSuite(`All ${ACTIVITIES.length} activities`, async (t) => {
  // Headless Chrome has no audio device, and the autoplay policy logs about it.
  t.ignoreConsole(/AudioContext|autoplay/i);

  await t.open('/activities/', `return !!document.getElementById('cards')`);
  const linked = await t.eval(`
    return [...document.querySelectorAll('#cards a[href]')]
      .map(a => a.getAttribute('href').replace(/\\/$/, ''));`);
  const cardCount = await t.eval(`return document.querySelectorAll('#cards .card').length;`);
  t.check(cardCount === ACTIVITIES.length,
    `the index lists all ${ACTIVITIES.length} activities`, `${cardCount} cards`);

  for (const name of ACTIVITIES) {
    t.check(linked.includes(name), `${name} is linked from the activities index`);
  }

  for (const name of ACTIVITIES) {
    await t.open(`/activities/${name}/`);

    const page = await t.eval(`
      return {
        title: document.title,
        h1: document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : null,
        main: !!document.getElementById('main'),
        skip: !!document.querySelector('.skip-link'),
        nav: document.querySelectorAll('#primary-nav a').length,
        back: !!document.querySelector('.site-footer a[href="../"]'),
        viewport: !!document.querySelector('meta[name=viewport]')
      };`);

    t.check(!!page.h1 && page.main && page.skip && page.nav === 6 && page.back && page.viewport,
      `${name} carries the shared page furniture`, JSON.stringify(page));
    t.check(page.title.includes('Scott Soward'), `${name} has a site title`, page.title);

    await t.phone();
    const layout = await t.eval(`
      const doc = document.documentElement;
      // Content wider than the screen is fine inside a designated horizontal
      // scroller — a board, a table, a diagram. What must not happen is the
      // page itself carrying the overflow.
      const inScroller = el => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') return true;
        }
        return false;
      };
      const wide = [...document.querySelectorAll('main *')].filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return false;
        if (r.left >= -1 && r.right <= window.innerWidth + 1) return false;
        return !inScroller(el);
      });
      return {
        scroll: [doc.scrollWidth, window.innerWidth],
        overflowing: wide.slice(0, 3).map(el => el.tagName + '.' + el.className),
        controls: [...document.querySelectorAll('.game-status select, .btn')]
          .every(el => el.getBoundingClientRect().height >= 36)
      };`);
    await t.desktop();

    t.check(layout.scroll[0] <= layout.scroll[1] + 1, `${name} does not scroll sideways on a phone`,
      `scrollWidth=${layout.scroll[0]} viewport=${layout.scroll[1]}`);
    t.check(layout.overflowing.length === 0,
      `${name} keeps its content on screen on a phone, or inside a scroller`,
      layout.overflowing.join(', '));
    t.check(layout.controls, `${name} keeps tappable controls on a phone`);
  }
});
