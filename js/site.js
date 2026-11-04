/**
 * site.js — shared behavior for every hub page (v2).
 *
 *   Theme      <html data-theme-support> pages get a light/dark toggle
 *              (.theme-toggle). The choice is stored per device; with no
 *              choice the OS setting wins. The <head> snippet written by
 *              tools/site-chrome.mjs sets data-theme before first paint.
 *   Menu       .nav-toggle opens #primary-nav below 920px. Escape, a click
 *              outside, choosing a link, or widening the window closes it.
 *   Tabs       [role=tablist][data-tabs] gets the WAI-ARIA tabs pattern:
 *              click, arrow keys, Home/End, and optional #hash sync
 *              (data-tabs-hash). Fires `tabchange` on the tablist.
 *   Collection [data-collection] wires a search box, filter buttons and a
 *              live result count over its [data-tags] cards.
 *
 * No dependencies. Safe to load on any page: every feature no-ops when its
 * markup is absent.
 */
(function () {
  'use strict';
  const root = document.documentElement;
  const KEY = 'hub-theme';

  /* ---------------- theme ---------------- */
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }
  };
  const systemDark = () => window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  const lock = root.getAttribute('data-theme-lock');   // a page designed for one theme only
  function applyTheme(theme) {
    if (lock) { root.setAttribute('data-theme', lock); return; }
    if (!root.hasAttribute('data-theme-support')) { root.setAttribute('data-theme', 'light'); return; }
    root.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(b => {
      b.setAttribute('aria-pressed', String(theme === 'dark'));
      b.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1117' : '#ffffff');
  }
  applyTheme(store.get() || (systemDark() ? 'dark' : 'light'));
  document.querySelectorAll('.theme-toggle').forEach(b => {
    if (lock || !root.hasAttribute('data-theme-support')) { b.hidden = true; return; }
    b.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      store.set(next); applyTheme(next);
    });
  });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', e => {
      if (!store.get()) applyTheme(e.matches ? 'dark' : 'light');
    });
  }

  /* ---------------- mobile menu ---------------- */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    const setOpen = (open, focusBack) => {
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (!open && focusBack) toggle.focus();
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true);
    });
    document.addEventListener('click', e => {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    if (window.matchMedia) {
      matchMedia('(min-width: 921px)').addEventListener?.('change', e => { if (e.matches) setOpen(false); });
    }
  }

  /* ---------------- tabs ---------------- */
  function initTabs(list) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    if (!tabs.length) return;
    const useHash = list.hasAttribute('data-tabs-hash');
    const panelOf = t => document.getElementById(t.getAttribute('aria-controls'));
    function select(tab, { focus = false, push = false } = {}) {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const p = panelOf(t); if (p) p.hidden = !on;
      });
      if (focus) tab.focus();
      if (useHash && push) {
        const id = tab.getAttribute('aria-controls');
        history.replaceState(null, '', '#' + id);
      }
      list.dispatchEvent(new CustomEvent('tabchange', { detail: { tab, panel: panelOf(tab) } }));
    }
    list.addEventListener('click', e => {
      const t = e.target.closest('[role="tab"]');
      if (t && list.contains(t)) select(t, { push: true });
    });
    list.addEventListener('keydown', e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = tabs.length - 1;
      if (n === null) return;
      e.preventDefault();
      select(tabs[n], { focus: true, push: true });
    });
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return false;
      const t = tabs.find(x => x.getAttribute('aria-controls') === id || x.id === id);
      if (t) { select(t); return true; }
      // A hash pointing inside a panel opens that panel.
      const target = document.getElementById(id);
      const owner = target && tabs.find(x => panelOf(x)?.contains(target));
      if (owner) { select(owner); requestAnimationFrame(() => target.scrollIntoView()); return true; }
      return false;
    };
    if (!(useHash && fromHash())) {
      select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0]);
    }
    if (useHash) window.addEventListener('hashchange', fromHash);
    list._selectTab = (idOrIndex) => {
      const t = typeof idOrIndex === 'number' ? tabs[idOrIndex]
        : tabs.find(x => x.getAttribute('aria-controls') === idOrIndex || x.id === idOrIndex);
      if (t) select(t, { push: true });
    };
  }
  document.querySelectorAll('[role="tablist"][data-tabs]').forEach(initTabs);
  window.HubTabs = { init: initTabs };

  /* ---------------- collections (search + filter) ---------------- */
  function initCollection(box) {
    const cards = [...box.querySelectorAll('[data-tags]')];
    const buttons = [...box.querySelectorAll('[data-filter]')];
    const search = box.querySelector('[data-collection-search]');
    const count = box.querySelector('[data-collection-count]');
    const empty = box.querySelector('[data-collection-empty]');
    const noun = box.getAttribute('data-noun') || 'item';
    const nouns = box.getAttribute('data-noun-plural') || noun + 's';
    const valid = new Set(buttons.map(b => b.dataset.filter));
    const tagsOf = c => (c.getAttribute('data-tags') || '').split(/\s+/).filter(Boolean);
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const hay = new Map(cards.map(c => [c, norm(c.textContent + ' ' + (c.getAttribute('data-keywords') || ''))]));
    let tag = 'all';

    buttons.forEach(b => {
      const n = b.dataset.filter === 'all' ? cards.length : cards.filter(c => tagsOf(c).includes(b.dataset.filter)).length;
      const slot = b.querySelector('.count');
      if (slot) slot.textContent = String(n);
    });

    function apply() {
      const words = search ? norm(search.value).trim().split(/\s+/).filter(Boolean) : [];
      let shown = 0;
      cards.forEach(c => {
        const ok = (tag === 'all' || tagsOf(c).includes(tag)) && words.every(w => hay.get(c).includes(w));
        c.hidden = !ok; if (ok) shown++;
      });
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === tag)));
      if (count) {
        const label = buttons.find(b => b.dataset.filter === tag);
        const what = tag === 'all' ? '' : ` in ${label ? label.firstChild.textContent.trim() : tag}`;
        count.textContent = shown === cards.length && !words.length
          ? `${shown} ${shown === 1 ? noun : nouns}`
          : `${shown} of ${cards.length} ${nouns}${what}${words.length ? ` matching “${search.value.trim()}”` : ''}`;
      }
      if (empty) empty.hidden = shown !== 0;
    }
    buttons.forEach(b => b.addEventListener('click', () => {
      tag = b.dataset.filter;
      if (box.hasAttribute('data-collection-hash')) {
        history.replaceState(null, '', tag === 'all' ? location.pathname + location.search : '#' + tag);
      }
      apply();
    }));
    if (search) {
      search.addEventListener('input', apply);
      search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; apply(); } });
    }
    box.querySelectorAll('[data-collection-reset]').forEach(b => b.addEventListener('click', () => {
      tag = 'all'; if (search) search.value = ''; apply(); search?.focus();
    }));
    const fromHash = () => {
      const h = decodeURIComponent(location.hash.slice(1)).toLowerCase();
      if (valid.has(h)) { tag = h; apply(); }
    };
    if (box.hasAttribute('data-collection-hash')) { window.addEventListener('hashchange', fromHash); fromHash(); }
    // "/" focuses search, like most docs sites.
    if (search) document.addEventListener('keydown', e => {
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); }
    });
    apply();
  }
  document.querySelectorAll('[data-collection]').forEach(initCollection);

  /* ---------------- footer year ---------------- */
  document.querySelectorAll('[data-year], #year').forEach(el => { el.textContent = String(new Date().getFullYear()); });
})();
