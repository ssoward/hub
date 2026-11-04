/**
 * Static site check: reads every HTML page and fails on structural problems a
 * browser would hide. No browser, no dependencies, runs in about a second.
 *
 *   npm run test:site
 *
 * Every page:   lang, charset, viewport, <title>; local links and assets
 *               resolve; no duplicate ids; no broken HTML entities
 *               ("ldquo;" printed as text); images have alt.
 * Hub pages     (those using css/site.css + the shared header):
 *               header/footer match tools/site-chrome.mjs; one <h1>;
 *               headings never skip a level; no onclick on non-buttons;
 *               same-page #anchors exist; cards have one named link.
 * Home:         section tile counts match the section index pages.
 * Privacy:      pages under a /private/ folder hold only ciphertext.
 * PWA:          every file the service worker precaches exists.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, relative, normalize, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, chromePages } from './site-chrome.mjs';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const SKIP = /(^|\/)(node_modules|\.git|reveal\/plugin)(\/|$)/;

let failures = 0, checks = 0;
const fail = (page, msg) => { failures++; console.log(` FAIL  ${page}: ${msg}`); };
const ok = () => { checks++; };

const pages = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const rel = relative(ROOT, p).split('\\').join('/');
    if (SKIP.test(rel)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(rel);
  }
})(ROOT);
const hub = new Set(chromePages());

const stripScripts = h => h.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
const attrs = (h, name) => [...h.matchAll(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'gi'))].map(m => m[1]);

function resolveLocal(page, url) {
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (!clean) return true;
  const target = clean.startsWith('/') ? join(ROOT, clean) : join(ROOT, dirname(page), clean);
  if (!existsSync(target)) return false;
  return statSync(target).isDirectory() ? existsSync(join(target, 'index.html')) : true;
}

for (const page of pages) {
  const raw = readFileSync(join(ROOT, page), 'utf8');
  const html = stripScripts(raw);
  const isPrivate = page.includes('/private/');

  // ---- privacy: private pages must be the encrypted shell only
  if (isPrivate) {
    const enc = /AES-GCM/.test(raw) && /PBKDF2/.test(raw);
    const leaked = /<main[\s>]/i.test(html) || /<table[\s>]/i.test(html);
    if (!enc || leaked) fail(page, 'private page is not the encrypted shell (plaintext would be public on GitHub Pages)'); else ok();
    if (!/name="robots"[^>]*noindex/.test(raw)) fail(page, 'private page should be noindex'); else ok();
    continue;
  }

  // ---- document basics
  if (!/<html[^>]*\slang="[a-z-]+"/i.test(raw)) fail(page, 'missing <html lang>'); else ok();
  if (!/<meta charset=/i.test(raw)) fail(page, 'missing <meta charset>'); else ok();
  if (!/<meta name="viewport"[^>]*width=device-width/i.test(raw)) fail(page, 'missing responsive viewport meta'); else ok();
  if (!/<title>[^<]+<\/title>/i.test(raw)) fail(page, 'missing <title>'); else ok();

  // ---- local links and assets resolve
  for (const url of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
    if (/^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(url) || url.includes('${')) continue;
    if (!resolveLocal(page, url)) fail(page, `broken local link/asset: ${url}`); else ok();
  }

  // ---- duplicate ids
  const ids = attrs(html, 'id');
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(page, `duplicate id(s): ${[...new Set(dup)].join(', ')}`); else ok();

  // ---- entity typos (an entity whose "&" went missing prints as text)
  const text = html.replace(/<[^>]+>/g, ' ');
  const bad = text.match(/(?<![&\w])(ldquo|rdquo|lsquo|rsquo|mdash|ndash|nbsp|amp|rarr|larr|bull|hellip);/g);
  if (bad) fail(page, `broken HTML entity printed as text: ${[...new Set(bad)].join(', ')}`); else ok();

  // ---- images have alt
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noAlt = imgs.filter(t => !/\salt\s*=/.test(t));
  if (noAlt.length) fail(page, `${noAlt.length} <img> without alt`); else ok();

  if (!hub.has(page)) continue;

  // ---- hub pages
  if (render(page, raw) !== raw) fail(page, 'header/footer out of date — run node tools/site-chrome.mjs'); else ok();
  const h1s = (html.match(/<h1\b/gi) || []).length;
  if (h1s !== 1) fail(page, `expected exactly one <h1>, found ${h1s}`); else ok();

  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map(m => Number(m[1]));
  const skips = [];
  levels.forEach((l, i) => { if (i && l > levels[i - 1] + 1) skips.push(`h${levels[i - 1]}→h${l}`); });
  if (skips.length) fail(page, `heading level skips: ${[...new Set(skips)].join(', ')}`); else ok();

  const clickables = (html.match(/<(div|span|li|td|tr|p|section|article|img)\b[^>]*\sonclick=/gi) || []).length;
  if (clickables) fail(page, `${clickables} non-button element(s) with onclick — use <button>`); else ok();

  const idSet = new Set(ids);
  for (const href of attrs(html, 'href').filter(h => /^#./.test(h))) {
    const id = decodeURIComponent(href.slice(1));
    if (!idSet.has(id) && !html.includes(`data-filter="${id}"`)) fail(page, `in-page link to missing #${id}`); else ok();
  }
  for (const id of attrs(html, 'aria-controls').concat(attrs(html, 'aria-labelledby').flatMap(v => v.split(/\s+/)))) {
    if (!idSet.has(id)) fail(page, `ARIA reference to missing id "${id}"`); else ok();
  }

  for (const card of html.match(/<article class="card[^"]*"[\s\S]*?<\/article>/g) || []) {
    if (!/<a\s/.test(card)) { ok(); continue; }   // an informational card with no link is fine
    const links = card.match(/<a class="card-link" href="[^"]+">([\s\S]*?)<\/a>/g) || [];
    const title = (card.match(/<h3 class="card-title">([\s\S]*?)<\/h3>/) || [, ''])[1].replace(/<[^>]+>/g, '').trim();
    if (links.length !== 1 || !title) fail(page, `card "${title || '?'}" needs exactly one .card-link with text`); else ok();
  }
}

// ---- home tiles show the right counts
const home = readFileSync(join(ROOT, 'index.html'), 'utf8');
for (const m of home.matchAll(/data-count-of="([^"]+)">([^<]+)</g)) {
  if (!m[1]) continue;
  const target = readFileSync(join(ROOT, m[1]), 'utf8');
  const n = (target.match(/<article class="card/g) || []).length;
  if (String(n) !== m[2].trim()) fail('index.html', `tile for ${m[1]} says ${m[2]} but that page lists ${n}`); else ok();
}
// The "All" filter count is computed at runtime, but the home grid should list
// every section index's featured cards at least once — make sure no card links
// to a page that doesn't exist (covered above) and the collection isn't empty.
if (!/<article class="card/.test(home)) fail('index.html', 'home page has no cards'); else ok();

// ---- service worker precache entries exist
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const pre = (sw.match(/STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1];
for (const m of pre.matchAll(/'([^']+)'/g)) {
  const p = m[1];
  if (p === '/') continue;
  if (!existsSync(join(ROOT, p))) fail('sw.js', `precaches missing file ${p}`); else ok();
}

console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'} — ${checks} checks across ${pages.length} pages (${hub.size} hub pages)`);
process.exit(failures ? 1 : 0);
