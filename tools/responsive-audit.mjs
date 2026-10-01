/**
 * Responsive audit: load every page at phone, tablet and desktop widths and
 * fail if any page scrolls sideways or has visible content poking past the
 * screen edge. Tiny text (<11px) and small tap targets (<32px) are reported
 * but don't fail, since game keyboards and map controls are legitimately small.
 *
 *   npm run test:responsive            # all pages (~5 min)
 *   ONLY=activities npm run test:responsive
 *
 * Slide decks scale as a whole, so their slides are not judged here.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runSuite, sleep, REPO_ROOT } from './browser-harness.mjs';

const SKIP = /node_modules|\.git\/|reveal\/plugin|\/private\//;
const pages = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (SKIP.test(p + (statSync(p).isDirectory() ? '/' : ''))) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push('/' + relative(REPO_ROOT, p));
  }
})(REPO_ROOT);
const only = process.env.ONLY ? pages.filter(p => p.includes(process.env.ONLY)) : pages;
const WIDTHS = [320, 375, 414, 768, 1024, 1280];

const PROBE = `
const vw = innerWidth;
const vis = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0; };
const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(p).overflowX)) return true; return false; };
const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
const els = [...document.body.querySelectorAll('*')];
const over = els.filter(el => { if (el.matches('.skip-link, .skip-link *')) return false; const r = el.getBoundingClientRect(); if (!(r.right > vw + 1 || r.left < -1)) return false; const s = getComputedStyle(el); if (s.position === 'fixed' && (r.left >= vw || r.right <= 0)) return false; return vis(el) && !clipped(el); });
const outer = over.filter(o => !over.some(x => x !== o && x.contains(o))).map(name);
const text = els.filter(el => vis(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2) && parseFloat(getComputedStyle(el).fontSize) < 11).length;
const taps = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return !(getComputedStyle(el).display === 'inline' && el.closest('p,li,td')) && (r.height < 32 || r.width < 32); }).length;
return { meta: !!document.querySelector('meta[name=viewport][content*="width=device-width"]'), hscroll: document.documentElement.scrollWidth - vw, outer: outer.slice(0, 3), text, taps, deck: !!document.querySelector('.reveal .slides') };`;

runSuite(`responsive audit (${only.length} pages × ${WIDTHS.length} widths)`, async (t) => {
  const notes = [];
  for (const w of WIDTHS) {
    await t.cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 768 ? 800 : 900, deviceScaleFactor: 1, mobile: w < 1024 });
    for (const p of only) {
      await t.open(p); await sleep(500);
      const r = await t.eval(PROBE);
      if (w === 375 && !r.meta) t.check(false, `${p} has a width=device-width viewport`);
      if (r.hscroll > 1) t.check(false, `${p} does not scroll sideways at ${w}px`, `${r.hscroll}px too wide`);
      if (!r.deck && r.outer.length) t.check(false, `${p} keeps content on screen at ${w}px`, r.outer.join(', '));
      if (w === 375 && (r.text || r.taps)) notes.push(`${p}: ${r.text} text <11px, ${r.taps} tap targets <32px`);
    }
  }
  t.check(true, `checked ${only.length} pages at ${WIDTHS.join(', ')}px`);
  if (notes.length) console.log('\n  info (375px, not failures):\n' + notes.map(n => '    ' + n).join('\n') + '\n');
});
