/**
 * Site chrome: writes the shared header, footer and <head> wiring into every
 * page that uses css/site.css, from the one template below.
 *
 *   node tools/site-chrome.mjs           # rewrite pages in place
 *   node tools/site-chrome.mjs --check   # exit 1 if any page is out of date
 *
 * The site has no build step, so every page carries its own copy of the
 * header. This keeps those copies identical: edit NAV or the templates here,
 * run the script, commit the result. `npm test` runs --check.
 *
 * What it owns on each page:
 *   - <!-- chrome:head --> … <!-- /chrome:head -->  theme bootstrap + site.js
 *   - <header class="site-header"> … </header>       brand, nav, theme, menu
 *   - <footer class="site-footer"> … </footer>       section links, GitHub
 * and it removes the old per-page inline menu scripts that site.js replaced.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/** Primary navigation. `match` decides which section a page belongs to. */
export const NAV = [
  { label: 'Home',         href: '',                    match: p => p === 'index.html' },
  { label: 'Conferences',  href: 'conferences/',        match: p => p.startsWith('conferences/') },
  { label: 'Tech & AI',    href: 'tech-presentations/', match: p => p.startsWith('tech-presentations/') },
  { label: 'Gospel',       href: 'presentations/',      match: p => p.startsWith('presentations/') },
  { label: 'Scripture',    href: 'alma31.html',         match: p => p === 'alma31.html' || p.startsWith('pages/') },
  { label: 'Study tools',  href: 'ham-radio/',          match: p => p.startsWith('ham-radio/') },
  { label: 'Activities',   href: 'activities/',         match: p => p.startsWith('activities/') },
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const ICON = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
};

/** Path from a page to the site root, e.g. "../../" ('' for root pages). */
const upTo = page => '../'.repeat(page.split('/').length - 1);

/** The section index page a page sits under, if any (for the footer back-link). */
function sectionOf(page) { return NAV.find(n => n.href && n.match(page)); }

function header(page) {
  const up = upTo(page);
  const links = NAV.map(n => {
    const target = n.href === '' ? 'index.html' : (n.href.endsWith('/') ? n.href + 'index.html' : n.href);
    const cur = page === target ? ' aria-current="page"' : (n.match(page) ? ' aria-current="true"' : '');
    const href = n.href ? up + n.href : (up || './');
    return `      <a href="${href}"${cur}>${esc(n.label)}</a>`;
  }).join('\n');
  return `<header class="site-header">
  <div class="container site-header-inner">
    <a class="brand" href="${up || './'}" aria-label="Scott Soward — home">
      <span class="brand-mark" aria-hidden="true">SS</span>
      <span class="brand-text"><span class="brand-name">Scott Soward</span><span class="brand-role">Engineer · Builder · Teacher</span></span>
    </a>
    <nav id="primary-nav" class="site-nav" aria-label="Primary">
${links}
    </nav>
    <div class="header-actions">
      <button type="button" class="icon-btn theme-toggle" aria-label="Switch to dark theme" aria-pressed="false">${ICON.moon}${ICON.sun}</button>
      <button type="button" class="icon-btn nav-toggle" aria-expanded="false" aria-controls="primary-nav" aria-label="Open menu">${ICON.menu}</button>
    </div>
  </div>
</header>`;
}

function footer(page) {
  const up = upTo(page);
  const sec = sectionOf(page);
  const isIndex = sec && (page === sec.href + 'index.html' || page === sec.href);
  const back = sec && !isIndex ? `\n      <a href="${up}${sec.href}">&larr; All ${esc(sec.label.toLowerCase())}</a>` : '';
  return `<footer class="site-footer">
  <div class="container site-footer-inner">
    <span>&copy; <span data-year>2026</span> Scott Soward</span>
    <nav aria-label="Footer">${back}
      <a href="${up || './'}">Home</a>
      <a href="https://github.com/ssoward/hub">Source on GitHub</a>
    </nav>
  </div>
</footer>`;
}

function head(page) {
  const up = upTo(page);
  // Runs before first paint so a dark-mode page never flashes white.
  return `<!-- chrome:head -->
  <script>(function(d){var r=d.documentElement,t=null;try{t=localStorage.getItem('hub-theme')}catch(e){}if(r.dataset.themeLock)t=r.dataset.themeLock;else if(!r.hasAttribute('data-theme-support'))t='light';else if(!t)t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';r.setAttribute('data-theme',t)})(document);</script>
  <script src="${up}js/site.js" defer></script>
  <!-- /chrome:head -->`;
}

/** Remove the old per-page inline menu IIFE and the `#year` one-liner. */
function stripLegacyScripts(html) {
  let out = html;
  for (;;) {
    const at = out.indexOf("querySelector('.nav-toggle')");
    if (at < 0) break;
    const start = out.lastIndexOf('(function', at);
    const end = out.indexOf('})();', at);
    if (start < 0 || end < 0 || out.slice(start + 9, at).includes('(function')) {
      throw new Error('unrecognized legacy menu script');
    }
    out = out.slice(0, start) + out.slice(end + 5);
  }
  out = out.replace(/^[ \t]*document\.getElementById\('year'\)\.textContent\s*=\s*new Date\(\)\.getFullYear\(\);?[ \t]*\r?\n?/gm, '');
  out = out.replace(/^[ \t]*const yearEl = document\.getElementById\('year'\);\s*\n[ \t]*if \(yearEl\) yearEl\.textContent = new Date\(\)\.getFullYear\(\);[ \t]*\r?\n?/gm, '');
  // A <script> block whose only content was the removed lines leaves blank lines.
  out = out.replace(/<script>\n(?:[ \t]*\n)+/g, '<script>\n');
  // Drop a <script> that is now empty.
  out = out.replace(/\n?[ \t]*<script>\s*<\/script>/g, '');
  return out;
}

export function render(page, html) {
  let out = stripLegacyScripts(html);
  // Keep any page-specific attributes on the opening tags (hat-riddle styles them).
  const keepOpen = (tpl, open) => tpl.replace(/^<(header|footer) class="site-(header|footer)">/, open);
  out = out.replace(/(<header class="site-header"[^>]*>)[\s\S]*?<\/header>/, (_, open) => keepOpen(header(page), open));
  if (/<footer class="site-footer"/.test(out)) {
    out = out.replace(/(<footer class="site-footer"[^>]*>)[\s\S]*?<\/footer>/, (_, open) => keepOpen(footer(page), open));
  } else {
    out = out.replace(/(\s*)<\/body>/, `\n\n${footer(page)}\n$1</body>`);
  }
  if (out.includes('<!-- chrome:head -->')) {
    out = out.replace(/<!-- chrome:head -->[\s\S]*?<!-- \/chrome:head -->/, head(page));
  } else {
    out = out.replace(/(\s*)<\/head>/, `\n  ${head(page)}$1</head>`);
  }
  return out;
}

export function chromePages() {
  const pages = [];
  (function walk(dir) {
    for (const f of readdirSync(dir)) {
      if (f === '.git' || f === 'node_modules') continue;
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.html')) {
        const html = readFileSync(p, 'utf8');
        if (/href="[./]*css\/site\.css"/.test(html) && html.includes('<header class="site-header"')) {
          pages.push(relative(ROOT, p).split('\\').join(posix.sep));
        }
      }
    }
  })(ROOT);
  return pages.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const stale = [];
  for (const page of chromePages()) {
    const file = join(ROOT, page);
    const html = readFileSync(file, 'utf8');
    const next = render(page, html);
    if (next !== html) {
      stale.push(page);
      if (!CHECK) writeFileSync(file, next);
    }
  }
  if (CHECK) {
    if (stale.length) { console.error(`site chrome out of date on ${stale.length} page(s):\n  ${stale.join('\n  ')}\nrun: node tools/site-chrome.mjs`); process.exit(1); }
    console.log(`site chrome up to date on ${chromePages().length} pages`);
  } else {
    console.log(`updated ${stale.length} of ${chromePages().length} pages`);
  }
}
