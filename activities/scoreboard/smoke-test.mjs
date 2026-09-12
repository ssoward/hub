/**
 * End-to-end smoke test for the Scoreboard activity.
 *
 * Same shape as ham-radio/tools/smoke-test.mjs: a static server plus headless
 * Chrome driven over the DevTools protocol, no npm dependencies. Exercises
 * increment, decrement, undo, rename, add/remove, reset, persistence, and the
 * mobile layout, and fails on any console error or failed request.
 *
 *   node activities/scoreboard/smoke-test.mjs
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
const PAGE = '/activities/scoreboard/';

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
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
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
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true, returnByValue: true
    });
    if (r.exceptionDetails) {
      throw new Error('page threw: ' + (r.exceptionDetails.exception?.description ||
        r.exceptionDetails.text));
    }
    return r.result.value;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - start > timeout) { check(false, `timed out waiting for ${label}`); return false; }
    await sleep(100);
  }
}

// ------------------------------------------------------------------- test

// Helpers that run inside the page.
const SCORES = `return [...document.querySelectorAll('.sb-value')].map(e => Number(e.textContent));`;
const NAMES = `return [...document.querySelectorAll('.sb-name')].map(e => e.value);`;
const tapScore = i => `document.querySelectorAll('.sb-score')[${i}].click(); return 1;`;
const tapMinus = i => `document.querySelectorAll('.sb-step.minus')[${i}].click(); return 1;`;
const tapPlus = i => `document.querySelectorAll('.sb-step.plus')[${i}].click(); return 1;`;

async function main() {
  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'scoreboard-smoke-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--window-size=1280,900', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

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
    await cdp.send('Page.navigate', { url: base + PAGE });
    await waitFor(() => cdp.eval(`return !!window.__scoreboard;`), 'the scoreboard to boot');

    check(await cdp.eval(`return document.title.includes('Scoreboard')`), 'page title');
    check((await cdp.eval(SCORES)).length === 2, 'starts with two players');
    check((await cdp.eval(SCORES)).every(n => n === 0), 'both start at zero');

    // ----------------------------------------------------- increment
    await cdp.eval(tapScore(0));
    await cdp.eval(tapScore(0));
    await cdp.eval(tapScore(1));
    let scores = await cdp.eval(SCORES);
    check(scores[0] === 2 && scores[1] === 1, 'tapping a score increments it', JSON.stringify(scores));
    check((await cdp.eval(`return document.getElementById('leader').textContent`)) ===
      (await cdp.eval(NAMES))[0], 'the leader pill names the player in front');

    await cdp.eval(tapPlus(1));
    scores = await cdp.eval(SCORES);
    check(scores[1] === 2, 'the + button increments', JSON.stringify(scores));
    check((await cdp.eval(`return document.getElementById('leader').textContent`)) === 'tied',
      'an all-square board reads as tied');

    // ----------------------------------------------------- decrement
    await cdp.eval(tapMinus(0));
    scores = await cdp.eval(SCORES);
    check(scores[0] === 1, 'the − button decrements', JSON.stringify(scores));

    await cdp.eval(tapMinus(0));
    await cdp.eval(tapMinus(0));
    scores = await cdp.eval(SCORES);
    check(scores[0] === -1, 'scores may go negative', JSON.stringify(scores));

    // ---------------------------------------------------- step value
    await cdp.eval(`const s = document.getElementById('step'); s.value = '5';
      s.dispatchEvent(new Event('change')); return 1;`);
    await cdp.eval(tapScore(0));
    scores = await cdp.eval(SCORES);
    check(scores[0] === 4, 'the step selector changes the tap amount', JSON.stringify(scores));
    await cdp.eval(tapMinus(0));
    check((await cdp.eval(SCORES))[0] === -1, 'the step selector applies to − as well');
    await cdp.eval(`const s = document.getElementById('step'); s.value = '1';
      s.dispatchEvent(new Event('change')); return 1;`);

    // --------------------------------------------------------- undo
    await cdp.eval(`document.getElementById('undo').click(); return 1;`);
    check((await cdp.eval(SCORES))[0] === 4, 'undo restores the previous score');
    await cdp.eval(`document.getElementById('undo').click(); return 1;`);
    check((await cdp.eval(SCORES))[0] === -1, 'undo unwinds repeatedly');

    // ------------------------------------------------ keyboard input
    await cdp.eval(`document.querySelectorAll('.sb-score')[1].focus(); return 1;`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
    check((await cdp.eval(SCORES))[1] === 3, 'ArrowUp on a focused score adds a point');
    check(await cdp.eval(`return document.activeElement.classList.contains('sb-score')`),
      'focus stays on the score after it changes');
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    check((await cdp.eval(SCORES))[1] === 2, 'ArrowDown takes one back');

    // ------------------------------------------------- add / rename / remove
    await cdp.eval(`document.getElementById('add').click(); return 1;`);
    check((await cdp.eval(SCORES)).length === 3, 'Add player adds a card');
    await cdp.eval(`const n = document.querySelectorAll('.sb-name')[2];
      n.value = 'Cougars'; n.dispatchEvent(new Event('change')); return 1;`);
    check((await cdp.eval(NAMES))[2] === 'Cougars', 'a player can be renamed');
    check(await cdp.eval(
      `return document.querySelectorAll('.sb-remove')[2].getAttribute('aria-label') === 'Remove Cougars'`),
      'the remove button relabels with the new name');

    await cdp.eval(`document.querySelectorAll('.sb-remove')[0].click(); return 1;`);
    check((await cdp.eval(SCORES)).length === 2, 'a player can be removed');
    check((await cdp.eval(NAMES)).includes('Cougars'), 'removing takes out the right card');

    // -------------------------------------------------------- reset
    await cdp.eval(`document.getElementById('reset').click(); return 1;`);
    check((await cdp.eval(SCORES)).every(n => n === 0), 'Reset scores zeroes every card');
    check((await cdp.eval(NAMES)).includes('Cougars'), 'Reset scores keeps the names');

    // -------------------------------------------------- persistence
    await cdp.eval(tapScore(1));
    await cdp.eval(tapScore(1));
    const savedScores = await cdp.eval(SCORES);
    const savedNames = await cdp.eval(NAMES);
    await cdp.send('Page.navigate', { url: base + PAGE });
    await waitFor(() => cdp.eval(`return !!window.__scoreboard;`), 'the scoreboard to reload');
    check(JSON.stringify(await cdp.eval(SCORES)) === JSON.stringify(savedScores),
      'scores survive a reload');
    check(JSON.stringify(await cdp.eval(NAMES)) === JSON.stringify(savedNames),
      'names survive a reload');

    // ------------------------------------------------------- mobile
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375, height: 667, deviceScaleFactor: 2, mobile: true
    });
    await sleep(200);
    check(await cdp.eval(`return document.documentElement.scrollWidth <= window.innerWidth + 1`),
      'no horizontal scroll at 375px',
      `scrollWidth=${await cdp.eval(`return document.documentElement.scrollWidth`)}`);
    check(await cdp.eval(`
      return [...document.querySelectorAll('.sb-score, .sb-step, .sb-remove, .btn')]
        .every(el => el.getBoundingClientRect().height >= 40);`),
      'every tap target is at least 40px tall at phone width');
    check(await cdp.eval(`
      const r = document.querySelector('.sb-player').getBoundingClientRect();
      return r.left >= 0 && r.right <= window.innerWidth + 1;`),
      'player cards stay inside the viewport at phone width');
    // The whole board should be reachable without pinching: a tap still scores.
    await cdp.eval(tapScore(0));
    check((await cdp.eval(SCORES))[0] === savedScores[0] + 1, 'tapping still scores on mobile');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false
    });

    // ------------------------------------------------ clear + index link
    await cdp.eval(`document.getElementById('clear').click(); return 1;`);
    check((await cdp.eval(SCORES)).length === 2 && (await cdp.eval(SCORES)).every(n => n === 0),
      'Clear all returns a fresh two-player board');

    await cdp.send('Page.navigate', { url: base + '/' });
    await waitFor(() => cdp.eval(`return !!document.getElementById('cards')`), 'the home page');
    check(await cdp.eval(
      `return !!document.querySelector('#cards a[href="activities/scoreboard/"]')`),
      'the home page links to the scoreboard');

    await cdp.send('Page.navigate', { url: base + '/activities/' });
    await waitFor(() => cdp.eval(`return !!document.getElementById('cards')`), 'the activities index');
    check(await cdp.eval(
      `return !!document.querySelector('#cards a[href="scoreboard/"]')`),
      'the activities index links to the scoreboard');

    // ------------------------------------------------------- hygiene
    check(consoleErrors.length === 0, 'no console errors or warnings', consoleErrors.join(' | '));
    check(failedRequests.length === 0, 'no failed requests', failedRequests.join(' | '));
  } finally {
    chrome.kill();
    server.close();
    await rm(profile, { recursive: true, force: true });
  }

  console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
