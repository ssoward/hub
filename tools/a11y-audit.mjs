/**
 * Accessibility + interaction audit for the hub pages, in headless Chrome.
 *
 *   npm run test:a11y
 *   ONLY=conferences npm run test:a11y
 *
 * For every hub page (shared header + css/site.css), at phone and desktop
 * widths, and in dark mode too on pages that support it:
 *   - landmarks: one <main>, a banner header, a labelled primary nav
 *   - every visible link, button and form field has an accessible name
 *   - text contrast meets WCAG AA (4.5:1, or 3:1 for large text)
 *   - no console errors or failed requests (the harness enforces this)
 * Then the shared behaviors, driven like a user would:
 *   - the phone menu opens, closes on Escape, and returns focus
 *   - the theme toggle switches and remembers the theme
 *   - every ARIA tablist switches panels by click and by arrow keys
 *   - the home page search, filters, result count and empty state
 *   - the first Tab press lands on the skip link
 *
 * Games are excluded from the contrast check (decorative boards and game
 * pieces aren't text), but they get every other check.
 */
import { runSuite, sleep } from './browser-harness.mjs';
import { chromePages } from './site-chrome.mjs';

const ONLY = process.env.ONLY;
const pages = chromePages().map(p => '/' + p).filter(p => !ONLY || p.includes(ONLY));
const isGame = p => /^\/activities\/[^/]+\//.test(p);

const PROBE = String.raw`
const vis = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const nameOf = el => {
  const by = el.getAttribute('aria-labelledby');
  if (by) return by.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
  if (el.matches('input,select,textarea')) {
    if (el.id && document.querySelector('label[for="' + el.id + '"]')) return document.querySelector('label[for="' + el.id + '"]').textContent.trim();
    if (el.closest('label')) return el.closest('label').textContent.trim() || el.placeholder;
    return el.title || '';
  }
  const t = [...el.querySelectorAll('img[alt]')].map(i => i.alt).join(' ');
  return (el.innerText || el.textContent || '').trim() || t || el.title || '';
};
const label = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

// --- landmarks
const mains = document.querySelectorAll('main').length;
const banner = !!document.querySelector('body > header, header.site-header');
const nav = !!document.querySelector('nav[aria-label]');

// --- accessible names
const unnamed = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab]')]
  .filter(el => vis(el) && !el.closest('[aria-hidden="true"]') && !nameOf(el)).map(label);

// --- contrast
const parse = c => {
  let m = c.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r, g, b, a }; }
  m = c.match(/color\(srgb ([^)]+)\)/);   // what color-mix() computes to
  if (m) { const [r, g, b, a = 1] = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r: r * 255, g: g * 255, b: b * 255, a }; }
  return null;
};
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
function bgOf(el) {
  const layers = [];
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (s.backgroundImage !== 'none' && !/^url\(/.test(s.backgroundImage)) return null; // gradient: can't judge
    if (s.backgroundImage !== 'none') return null;
    const c = parse(s.backgroundColor);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
  }
  let out = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  if (out.a < 1) out = { r: 255, g: 255, b: 255, a: 1 };
  for (const l of layers.reverse()) out = blend(l, out);
  return out;
}
const lowContrast = [];
if (CHECK_CONTRAST) {
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (lowContrast.length > 6) break;
    if (!vis(el) || el.closest('[aria-hidden="true"], svg, canvas, .reveal, .visually-hidden, .skip-link')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text') continue;
    const fg = parse(s.color); const bg = bgOf(el);
    if (!fg || !bg || fg.a === 0) continue;
    const f = fg.a < 1 ? blend(fg, bg) : fg;
    const [L1, L2] = [lum(f), lum(bg)].sort((a, b) => b - a);
    const ratio = (L1 + 0.05) / (L2 + 0.05);
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    if (ratio < need - 0.05) {
      const key = label(el) + ratio.toFixed(1);
      if (!seen.has(key)) { seen.add(key); lowContrast.push(label(el) + ' "' + el.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2) + ':1'); }
    }
  }
}
return { mains, banner, nav, unnamed: unnamed.slice(0, 6), unnamedCount: unnamed.length, lowContrast };`;

async function setViewport(t, width) {
  await t.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: width < 768 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 1024 });
}
async function setTheme(t, theme) {
  await t.eval(`try { localStorage.setItem('hub-theme', '${theme}') } catch {} return 1`);
}
const key = (t, k, code, keyCode) => Promise.all([
  t.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: keyCode }),
]).then(() => t.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: keyCode }));

runSuite(`a11y + interaction audit (${pages.length} hub pages)`, async (t) => {
  // ---------------- per-page structural checks
  await t.open('/');
  for (const width of [375, 1280]) {
    await setViewport(t, width);
    for (const p of pages) {
      for (const theme of ['light', 'dark']) {
        await setTheme(t, theme);
        await t.open(p); await sleep(150);
        const supports = await t.eval(`return document.documentElement.hasAttribute('data-theme-support')`);
        if (theme === 'dark' && !supports) continue;
        const r = await t.eval(PROBE.replace('CHECK_CONTRAST', String(!isGame(p))));
        const tag = `${p} @${width}px ${theme}`;
        if (theme === 'light') {
          t.check(r.mains === 1 && r.banner && r.nav, `${tag}: landmarks`, `main×${r.mains} banner:${r.banner} nav:${r.nav}`);
          t.check(r.unnamedCount === 0, `${tag}: controls have names`, `${r.unnamedCount} unnamed: ${r.unnamed.join(', ')}`);
        }
        t.check(r.lowContrast.length === 0, `${tag}: text contrast ≥ AA`, r.lowContrast.join('; '));
      }
    }
  }
  await setTheme(t, 'light');

  // ---------------- skip link is the first stop
  await setViewport(t, 1280);
  await t.open('/index.html');
  await key(t, 'Tab', 'Tab', 9);
  t.check(await t.eval(`return document.activeElement.matches('.skip-link')`), 'first Tab focuses the skip link');

  // ---------------- phone menu
  await setViewport(t, 375);
  await t.open('/conferences/index.html');
  const navHidden = () => t.eval(`return getComputedStyle(document.getElementById('primary-nav')).display === 'none'`);
  t.check(await navHidden(), 'phone: menu starts closed');
  await t.eval(`document.querySelector('.nav-toggle').click(); return 1`);
  t.check(!(await navHidden()) && await t.eval(`return document.querySelector('.nav-toggle').getAttribute('aria-expanded') === 'true'`), 'phone: menu button opens the menu');
  t.check(await t.eval(`return [...document.querySelectorAll('#primary-nav a')].every(a => a.getBoundingClientRect().height >= 44)`), 'phone: menu links are ≥44px tall');
  await t.eval(`document.querySelector('.nav-toggle').focus(); return 1`);
  await key(t, 'Escape', 'Escape', 27);
  t.check(await navHidden() && await t.eval(`return document.activeElement.matches('.nav-toggle')`), 'phone: Escape closes the menu and keeps focus on the button');
  await t.eval(`document.querySelector('.nav-toggle').click(); return 1`);
  await t.eval(`document.querySelector('main').click(); return 1`);
  t.check(await navHidden(), 'phone: clicking outside closes the menu');

  // ---------------- theme toggle
  await setViewport(t, 1280);
  await t.eval(`localStorage.removeItem('hub-theme'); return 1`);
  await t.cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await t.open('/index.html');
  t.check(await t.eval(`return document.documentElement.dataset.theme === 'light'`), 'theme: follows the OS (light) by default');
  await t.eval(`document.querySelector('.theme-toggle').click(); return 1`);
  t.check(await t.eval(`return document.documentElement.dataset.theme === 'dark' && localStorage.getItem('hub-theme') === 'dark'`), 'theme: toggle switches to dark and remembers it');
  await t.open('/conferences/index.html');
  t.check(await t.eval(`return document.documentElement.dataset.theme === 'dark'`), 'theme: choice carries to the next page');
  await t.open('/activities/chess/index.html');
  t.check(await t.eval(`return document.documentElement.dataset.theme === 'light' && document.querySelector('.theme-toggle').hidden`), 'theme: light-only pages stay light and hide the toggle');
  await t.eval(`localStorage.setItem('hub-theme', 'light'); return 1`);

  // ---------------- tabs, wherever they appear
  for (const p of pages) {
    await t.open(p);
    const lists = await t.eval(`return document.querySelectorAll('[role=tablist][data-tabs]').length`);
    for (let i = 0; i < lists; i++) {
      const res = await t.eval(`
        const list = document.querySelectorAll('[role=tablist][data-tabs]')[${i}];
        const tabs = [...list.querySelectorAll('[role=tab]')];
        if (tabs.length < 2) return { skip: true };
        // A tablist nested in a closed panel is reached by opening that panel first.
        for (let p = list.closest('[role=tabpanel]'); p; p = p.parentElement?.closest('[role=tabpanel]')) {
          if (p.hidden) document.querySelector('[role=tab][aria-controls="' + p.id + '"]')?.click();
        }
        const shown = () => tabs.filter(t => !document.getElementById(t.getAttribute('aria-controls')).hidden).map(t => t.id);
        const okInit = shown().length === 1;
        tabs[1].click();
        const okClick = tabs[1].getAttribute('aria-selected') === 'true' && shown().join() === tabs[1].id;
        tabs[1].focus();
        tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        const want = tabs[2 % tabs.length];
        const okKey = document.activeElement === want && want.getAttribute('aria-selected') === 'true';
        const roving = tabs.filter(t => t.tabIndex === 0).length === 1;
        tabs[0].click();
        return { okInit, okClick, okKey, roving, n: tabs.length };`);
      if (res.skip) continue;
      t.check(res.okInit && res.okClick && res.okKey && res.roving, `${p}: tablist ${i + 1} (${res.n} tabs) works by click and arrow keys`, JSON.stringify(res));
    }
  }

  // ---------------- home: search, filters, empty state
  await t.open('/index.html');
  const count = () => t.eval(`return document.querySelectorAll('#cards [data-tags]:not([hidden])').length`);
  const total = await t.eval(`return document.querySelectorAll('#cards [data-tags]').length`);
  t.check(await count() === total, `home: all ${total} cards show initially`);
  const typeSearch = async q => t.eval(`const s = document.querySelector('[data-collection-search]'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('input')); return 1`);
  await typeSearch('chess');
  t.check(await count() === 1, 'home: searching "chess" leaves one card');
  await typeSearch('');
  await t.eval(`document.querySelector('[data-filter="gospel"]').click(); return 1`);
  const gospel = await t.eval(`return document.querySelectorAll('#cards [data-tags~="gospel"]').length`);
  t.check(await count() === gospel, `home: Gospel filter shows its ${gospel} cards`);
  t.check(await t.eval(`return document.querySelector('[data-filter="gospel"]').getAttribute('aria-pressed') === 'true' && location.hash === '#gospel'`), 'home: filter is pressed and in the URL');
  t.check(await t.eval(`return /of ${total}/.test(document.querySelector('[data-collection-count]').textContent)`), 'home: result count reflects the filter');
  await typeSearch('zzzz-no-such-thing');
  t.check(await count() === 0 && await t.eval(`return !document.querySelector('[data-collection-empty]').hidden`), 'home: empty state appears when nothing matches');
  await t.eval(`document.querySelector('[data-collection-reset]').click(); return 1`);
  t.check(await count() === total, 'home: "Clear" restores every card');
  await t.open('/index.html#tech');
  t.check(await count() === await t.eval(`return document.querySelectorAll('#cards [data-tags~="tech"]').length`), 'home: #tech deep link opens pre-filtered');

  // ---------------- cards: one link each, whole card is the target
  await t.open('/index.html');
  t.check(await t.eval(`return [...document.querySelectorAll('#cards .card')].every(c => { c.scrollIntoView({ block: 'center', behavior: 'instant' }); const a = c.querySelector('.card-link'); const r = c.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.bottom - 10); return a && (el === a || a.contains(el) || el.closest('.card') === c); })`), 'home: clicking anywhere on a card hits its link');
});
