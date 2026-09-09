/**
 * End-to-end smoke test for the Ham Radio Exam Trainer.
 *
 * Starts a static server, drives headless Chrome over the DevTools protocol
 * (no npm dependencies — Node's built-in WebSocket and fetch), exercises all
 * three modes on all three pools, and fails on any console error, page error,
 * failed request, or broken assertion.
 *
 *   node ham-radio/tools/smoke-test.mjs
 *
 * Requires Google Chrome at the usual macOS location, or CHROME=/path/to/chrome.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = '/ham-radio/';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json'
};

let failures = 0;
function check(ok, label, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// ----------------------------------------------------------------- server

function serve() {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ------------------------------------------------------------------- CDP

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        (this.listeners?.[msg.method] || []).forEach(fn => fn(msg.params));
      }
    });
  }
  static async attach(port) {
    for (let i = 0; i < 100; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          const ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', rej, { once: true });
          });
          return new CDP(ws);
        }
      } catch { /* chrome still starting */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('could not attach to Chrome');
  }
  on(method, fn) {
    this.listeners = this.listeners || {};
    (this.listeners[method] = this.listeners[method] || []).push(fn);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr, { awaitPromise = true } = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise, returnByValue: true
    });
    if (r.exceptionDetails) {
      throw new Error('page threw: ' + (r.exceptionDetails.exception?.description ||
        r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Progress writes are debounced in the page; give them time to land.
const settle = () => sleep(400);

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - start > timeout) { check(false, `timed out waiting for ${label}`); return false; }
    await sleep(100);
  }
}

// ------------------------------------------------------------------- test

async function main() {
  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'ham-smoke-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--window-size=1280,900', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome prints the DevTools port it actually chose on stderr.
  const debugPort = await new Promise((resolve, reject) => {
    let buf = '';
    chrome.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    chrome.on('exit', c => reject(new Error(`chrome exited early (${c}): ${buf}`)));
    setTimeout(() => reject(new Error('chrome never reported a debug port: ' + buf)), 20000);
  });

  const cdp = await CDP.attach(debugPort);
  const consoleErrors = [];
  const failedRequests = [];

  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error' || p.type === 'warning') {
      consoleErrors.push(p.type + ': ' + p.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', p => {
    consoleErrors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  });
  cdp.on('Network.loadingFailed', p => failedRequests.push(p.errorText));
  cdp.on('Network.responseReceived', p => {
    if (p.response.status >= 400) failedRequests.push(`${p.response.status} ${p.response.url}`);
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');

  const base = `http://127.0.0.1:${port}`;
  console.log(`\nserving ${ROOT} on ${base}\n`);

  try {
    // ---------------------------------------------------------- load
    await cdp.send('Page.navigate', { url: base + PAGE + '#tech/flash' });
    await waitFor(() => cdp.eval(`return !!(window.__ham && window.__ham.pools.tech)`),
      'the Technician pool to load');

    check(await cdp.eval(`return document.title.includes('Ham Radio')`), 'page title');
    check((await cdp.eval(`return document.getElementById('pool-summary').textContent`))
      .includes('Technician'), 'pool summary names the class');
    check(await cdp.eval(`return window.__ham.pools.tech.questions.length === 409`),
      'Technician pool has 409 questions');

    // ------------------------------------------------- flash card mode
    check(await cdp.eval(`return !!document.querySelector('.hr-card .hr-question').textContent.trim()`),
      'a flash card renders with question text');
    check(await cdp.eval(`return document.querySelectorAll('.hr-card .hr-choice').length === 0`),
      'the answer is hidden before it is asked for');

    const firstId = await cdp.eval(`return document.querySelector('.hr-qid').textContent`);
    await cdp.eval(`document.getElementById('flash-reveal').click(); return 1`);
    check(await cdp.eval(`return document.querySelectorAll('.hr-card .hr-choice').length === 4`),
      'revealing shows all four choices');
    check(await cdp.eval(`return document.querySelectorAll('.hr-card .hr-choice.correct').length === 1`),
      'exactly one choice is marked correct');
    check(await cdp.eval(`
      const q = window.__ham.pools.tech.byId['${firstId}'];
      const marked = document.querySelector('.hr-choice.correct span:nth-child(2)').textContent;
      return marked === q.c['ABCD'.indexOf(q.a)];
    `), 'the marked choice is the pool\'s answer');

    // Space toggles reveal, 2 grades it right.
    await cdp.eval(`
      [...document.querySelectorAll('.hr-actions .btn')].find(b => b.textContent === 'Got it').click();
      return 1;
    `);
    await settle();
    check(await cdp.eval(`
      const st = JSON.parse(localStorage.getItem('hamradio.v1'));
      return st.tech.q['${firstId}'].b === 1 && st.tech.q['${firstId}'].n === 1;
    `), 'grading a card writes its Leitner box to localStorage');
    check(await cdp.eval(`return document.querySelector('.hr-qid').textContent !== '${firstId}'`),
      'the deck advances to a different card');

    // Keyboard: space reveals.
    await cdp.eval(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      return 1;
    `);
    check(await cdp.eval(`return document.querySelectorAll('.hr-choice.correct').length === 1`),
      'the space key reveals the answer');

    // Star + starred filter.
    await cdp.eval(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      return 1;
    `);
    check(await cdp.eval(`return document.querySelector('.hr-star').getAttribute('aria-pressed') === 'true'`),
      'the S key stars a question');
    await cdp.eval(`
      const f = document.getElementById('flash-filter');
      f.value = 'starred'; f.dispatchEvent(new Event('change'));
      return 1;
    `);
    check(await cdp.eval(`return window.__ham.flash.deck.length === 1`),
      'the starred filter narrows the deck to the one starred card');

    // Deck scope narrows to a single group.
    await cdp.eval(`
      const f = document.getElementById('flash-filter'); f.value = 'mix'; f.dispatchEvent(new Event('change'));
      const s = document.getElementById('flash-scope'); s.value = 'T1A'; s.dispatchEvent(new Event('change'));
      return 1;
    `);
    check(await cdp.eval(`
      return window.__ham.flash.deck.every(id => id.startsWith('T1A')) &&
             window.__ham.flash.deck.length > 5;
    `), 'the deck scope narrows to one question group');
    await cdp.eval(`
      const s = document.getElementById('flash-scope'); s.value = 'all'; s.dispatchEvent(new Event('change'));
      return 1;
    `);

    // ---------------------------------------------------- practice exam
    await cdp.eval(`document.getElementById('tab-exam').click(); return 1`);
    check(await cdp.eval(`return document.getElementById('panel-exam').hidden === false`),
      'the exam panel opens');
    await cdp.eval(`
      [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Start')).click();
      return 1;
    `);
    check(await cdp.eval(`return window.__ham.exam.items.length === 35`),
      'a Technician exam is 35 questions');
    check(await cdp.eval(`
      const ex = window.__ham.exam;
      const groups = ex.items.map(i => i.id.slice(0, 3));
      return new Set(groups).size === 35 &&
             new Set(groups).size === window.__ham.pools.tech.groups.length;
    `), 'the exam draws exactly one question from each group');
    check(await cdp.eval(`
      return window.__ham.exam.items.every(i =>
        i.order.length === 4 && new Set(i.order).size === 4);
    `), 'every question gets a full shuffle of its four choices');
    check(await cdp.eval(`return document.querySelectorAll('.hr-nav-grid button').length === 35`),
      'the navigator has a button per question');

    // Answer the whole exam correctly through the UI, one keypress per question.
    check(await cdp.eval(`
      const ex = window.__ham.exam;
      for (let i = 0; i < ex.items.length; i++) {
        const item = ex.items[i];
        const q = window.__ham.pools.tech.byId[item.id];
        const correctOrig = 'ABCD'.indexOf(q.a);
        const displayIdx = item.order.indexOf(correctOrig);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: String(displayIdx + 1), bubbles: true }));
        if (i < ex.items.length - 1) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        }
      }
      return ex.items.every(i => i.chosen !== null);
    `), 'number keys answer every question and arrows advance');

    await cdp.eval(`
      [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Grade')).click();
      return 1;
    `);
    check(await cdp.eval(`return window.__ham.exam.score === 35`),
      'a perfect run scores 35 / 35');
    check(await cdp.eval(`return !!document.querySelector('.hr-verdict.pass')`),
      'the verdict reads as a pass');
    check(await cdp.eval(`
      return document.querySelector('.hr-verdict-detail').textContent.includes('26');
    `), 'the verdict states the 26-question passing mark');
    await settle();
    check(await cdp.eval(`
      const st = JSON.parse(localStorage.getItem('hamradio.v1'));
      const last = st.tech.exams[st.tech.exams.length - 1];
      return last.score === 35 && last.total === 35 && last.ms >= 0;
    `), 'the exam result is saved to history');
    check(await cdp.eval(`
      return document.querySelectorAll('.hr-table tbody tr').length === 10;
    `), 'the results break the score down over all ten subelements');

    // A failing run: answer everything wrong and confirm the verdict flips.
    await cdp.eval(`
      [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('another exam')).click();
      const ex = window.__ham.exam;
      ex.items.forEach(item => {
        const q = window.__ham.pools.tech.byId[item.id];
        const correctOrig = 'ABCD'.indexOf(q.a);
        item.chosen = [0, 1, 2, 3].find(i => i !== correctOrig);
      });
      return 1;
    `);
    await cdp.eval(`
      window.confirm = () => true;
      [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Grade')).click();
      return 1;
    `);
    check(await cdp.eval(`return window.__ham.exam.score === 0 && !!document.querySelector('.hr-verdict.fail')`),
      'an all-wrong run fails');
    check(await cdp.eval(`return document.querySelectorAll('.hr-review .hr-card').length === 35`),
      'every missed question is listed for review');
    await settle();
    check(await cdp.eval(`
      const st = JSON.parse(localStorage.getItem('hamradio.v1'));
      return window.__ham.exam.items.every(i => st.tech.q[i.id].b === 0);
    `), 'missed questions drop back to box 0');

    // "Drill what I missed" hands off to the flash deck.
    await cdp.eval(`
      [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Drill')).click();
      return 1;
    `);
    check(await cdp.eval(`
      return window.__ham.mode === 'flash' &&
             document.getElementById('flash-filter').value === 'weak' &&
             window.__ham.flash.deck.length >= 35;
    `), 'drilling misses switches to the flash deck of weak questions');

    // ---------------------------------------------------------- browse
    await cdp.eval(`document.getElementById('tab-browse').click(); return 1`);
    check(await cdp.eval(`return document.querySelectorAll('#browse-holder details').length === 10`),
      'browse lists all ten subelements');
    check(await cdp.eval(`
      const s = document.getElementById('browse-search');
      s.value = 'repeater'; s.dispatchEvent(new Event('input'));
      return document.getElementById('browse-count').textContent.includes('match');
    `), 'searching reports a match count');
    check(await cdp.eval(`
      const items = document.querySelectorAll('#browse-holder .hr-q-item');
      return items.length > 5 && [...items].every(i => i.querySelector('.hr-choice.correct'));
      `), 'every browsed question shows its correct answer');
    check(await cdp.eval(`
      const s = document.getElementById('browse-search');
      s.value = 'T1A01'; s.dispatchEvent(new Event('input'));
      return document.querySelectorAll('#browse-holder .hr-q-item').length === 1;
    `), 'searching by question number finds the one question');
    await cdp.eval(`
      const s = document.getElementById('browse-search'); s.value = ''; s.dispatchEvent(new Event('input'));
      return 1;
    `);

    // ------------------------------------------------- the other two pools
    for (const [key, count, exam, pass] of [['general', 423, 35, 26], ['extra', 599, 50, 37]]) {
      await cdp.eval(`document.querySelector('[data-pool="${key}"]').click(); return 1`);
      await waitFor(() => cdp.eval(`return !!window.__ham.pools.${key}`), `the ${key} pool`);
      check(await cdp.eval(`return window.__ham.poolKey === '${key}' &&
        window.__ham.pools.${key}.questions.length === ${count}`),
        `${key} pool loads ${count} questions`);
      await cdp.eval(`document.getElementById('tab-exam').click();
        [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Start')).click();
        return 1`);
      check(await cdp.eval(`return window.__ham.exam.items.length === ${exam} &&
        new Set(window.__ham.exam.items.map(i => i.id.slice(0,3))).size === ${exam}`),
        `${key} exam is ${exam} questions, one per group`);
      check(await cdp.eval(`return window.__ham.pools.${key}.meta.pass === ${pass}`),
        `${key} passing mark is ${pass}`);
      await cdp.eval(`window.confirm = () => true;
        [...document.querySelectorAll('#panel-exam .btn')].find(b => b.textContent.includes('Abandon')).click();
        return 1`);
    }

    // ---------------------------------------------------------- figures
    check(await cdp.eval(`
      const figs = new Set();
      for (const key of ['tech', 'general', 'extra']) {
        const data = await (await fetch('data/' + key + '.json')).json();
        data.questions.forEach(q => { if (q.f) figs.add(q.f); });
      }
      const results = await Promise.all([...figs].map(f => new Promise(res => {
        const img = new Image();
        img.onload = () => res(img.naturalWidth > 100);
        img.onerror = () => res(false);
        img.src = 'figures/' + f + '.png';
      })));
      return figs.size === 14 && results.every(Boolean);
    `), 'all 14 referenced diagrams load as real images');

    // A figure question renders its diagram on the card.
    await cdp.eval(`
      location.hash = '#extra/flash';
      await new Promise(r => setTimeout(r, 400));
      const f = document.getElementById('flash-filter');
      f.value = 'mix'; f.dispatchEvent(new Event('change'));
      const s = document.getElementById('flash-scope'); s.value = 'E9G'; s.dispatchEvent(new Event('change'));
      return 1;
    `);
    check(await cdp.eval(`
      // Only two questions in E9G carry the Smith chart, so skip through the
      // deck until one of them comes up.
      let img = null;
      for (let i = 0; i < 60 && !img; i++) {
        img = document.querySelector('.hr-card .hr-figure img');
        if (img) break;
        [...document.querySelectorAll('.hr-actions .btn')]
          .find(b => b.textContent.startsWith('Skip')).click();
      }
      if (!img) return false;
      if (!img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
      return img.naturalWidth > 100 && img.alt.includes('figure') &&
             document.querySelector('.hr-figure figcaption').textContent === 'Figure E9-3';
    `), 'a Smith chart question shows the diagram with alt text');

    // ------------------------------------------------------- hash routing
    check(await cdp.eval(`
      location.hash = '#general/browse';
      await new Promise(r => setTimeout(r, 500));
      return window.__ham.poolKey === 'general' && window.__ham.mode === 'browse' &&
             document.getElementById('panel-browse').hidden === false;
    `), 'a hash link restores class and mode');

    // ------------------------------------------------- reload keeps progress
    await settle();
    await cdp.send('Page.navigate', { url: base + PAGE + '#tech/flash' });
    await waitFor(() => cdp.eval(`return !!(window.__ham && window.__ham.pools.tech)`),
      'the page to reload');
    check(await cdp.eval(`
      const st = JSON.parse(localStorage.getItem('hamradio.v1'));
      return st.tech.exams.length === 2 && Object.keys(st.tech.q).length > 35;
    `), 'progress and exam history survive a reload');

    // ----------------------------------------------------- responsive check
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375, height: 780, deviceScaleFactor: 2, mobile: true
    });
    await cdp.eval(`document.getElementById('flash-reveal')?.click(); return 1`);
    check(await cdp.eval(`
      return document.documentElement.scrollWidth <= window.innerWidth + 1;
    `), 'no horizontal overflow at 375px');
    check(await cdp.eval(`
      return getComputedStyle(document.querySelector('.nav-toggle')).display !== 'none';
    `), 'the mobile nav toggle appears at 375px');
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    // -------------------------------- deep links land straight in a mode
    for (const [hash, mode, expect] of [
      ['#tech/exam', 'exam', '#panel-exam .hr-exam-intro'],
      ['#general/browse', 'browse', '#browse-holder details'],
      ['#extra/flash', 'flash', '#flash-holder .hr-card']
    ]) {
      await cdp.send('Page.navigate', { url: base + PAGE + hash });
      await waitFor(() => cdp.eval(`return !!(window.__ham && window.__ham.pools[window.__ham.poolKey])`),
        `a cold load of ${hash}`);
      await sleep(200);
      check(await cdp.eval(`return window.__ham.mode === '${mode}' &&
        !!document.querySelector('${expect}')`),
        `a cold load of ${hash} renders that mode`);
    }

    // ------------------------------------------------- the hub links here
    await cdp.send('Page.navigate', { url: base + '/' });
    await waitFor(() => cdp.eval(`return !!document.getElementById('cards')`), 'the hub');
    check(await cdp.eval(`
      const card = [...document.querySelectorAll('#cards .card')]
        .find(c => c.querySelector('.card-title').textContent.includes('Ham Radio'));
      return !!card && card.dataset.tags === 'study' &&
             card.querySelector('a.btn').getAttribute('href') === 'ham-radio/';
    `), 'the hub has a card linking to the trainer');
    check(await cdp.eval(`
      const btn = document.querySelector('.filter-bar [data-filter="study"]');
      btn.click();
      const shown = [...document.querySelectorAll('#cards .card')].filter(c => !c.hidden);
      return shown.length === 1 && shown[0].querySelector('.card-title').textContent.includes('Ham Radio');
    `), 'the Study tools filter shows exactly that card');
    check(await cdp.eval(`
      const r = await fetch('/ham-radio/');
      return r.ok;
    `), 'the trainer is reachable from the hub link');

    // ------------------------------------------------------------ hygiene
    check(consoleErrors.length === 0, 'no console errors or warnings',
      consoleErrors.slice(0, 5).join(' | '));
    check(failedRequests.length === 0, 'no failed network requests',
      failedRequests.slice(0, 5).join(' | '));
  } catch (err) {
    check(false, 'test run completed without throwing', err.message);
  } finally {
    chrome.kill();
    server.close();
    await sleep(300);   // let Chrome finish unlinking its profile cache
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}

main();
