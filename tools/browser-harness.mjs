/**
 * A tiny headless-Chrome test harness for the static pages in this repo.
 *
 * Serves the repo root over HTTP and drives Chrome over the DevTools protocol —
 * no npm dependencies, same approach as ham-radio/tools/smoke-test.mjs, factored
 * out so each activity's smoke test is just its assertions.
 *
 *   import { runSuite } from '../../tools/browser-harness.mjs';
 *   runSuite('Snake', async (t) => {
 *     await t.open('/activities/snake/');
 *     t.check(await t.eval(`return document.title.includes('Snake')`), 'title');
 *   });
 *
 * Requires Google Chrome at the usual macOS location, or CHROME=/path/to/chrome.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ----------------------------------------------------------------- server

function serve(root) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
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
    this.listeners = {};
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        (this.listeners[msg.method] || []).forEach(fn => fn(msg.params));
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
      await sleep(100);
    }
    throw new Error('could not attach to Chrome');
  }
  on(method, fn) { (this.listeners[method] = this.listeners[method] || []).push(fn); }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launchChrome(profile) {
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    '--window-size=1280,900', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Chrome prints the DevTools port it actually chose on stderr.
  const port = await new Promise((resolve, reject) => {
    let buf = '';
    chrome.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)/);
      if (m) resolve(Number(m[1]));
    });
    chrome.on('exit', c => reject(new Error(`chrome exited early (${c}): ${buf}`)));
    setTimeout(() => reject(new Error('chrome never reported a debug port: ' + buf)), 20000);
  });
  return { chrome, port };
}

// ------------------------------------------------------------------ suite

/**
 * Run one suite. `body` receives a test context and may throw; the process
 * exits non-zero if any check fails or the body throws.
 */
export async function runSuite(name, body, { root = REPO_ROOT } = {}) {
  let failures = 0;
  const consoleErrors = [];
  const failedRequests = [];

  const { server, port } = await serve(root);
  const profile = await mkdtemp(join(tmpdir(), 'hub-smoke-'));
  const { chrome, port: debugPort } = await launchChrome(profile);
  const cdp = await CDP.attach(debugPort);

  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error' || p.type === 'warning') {
      consoleErrors.push(p.type + ': ' + p.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    }
  });
  cdp.on('Runtime.exceptionThrown', p => {
    consoleErrors.push('exception: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  });
  // Chrome probes /favicon.ico on its own however the page declares its icon,
  // and the site ships an SVG one, so that 404 is not the page's doing.
  const ownFault = url => !/\/favicon\.ico$/.test(url || '');
  cdp.on('Network.loadingFailed', p => failedRequests.push(p.errorText));
  cdp.on('Network.responseReceived', p => {
    if (p.response.status >= 400 && ownFault(p.response.url)) {
      failedRequests.push(`${p.response.status} ${p.response.url}`);
    }
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');

  const base = `http://127.0.0.1:${port}`;

  const t = {
    cdp, base, sleep,
    check(ok, label, detail) {
      console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
      if (!ok) failures++;
      return ok;
    },
    async eval(expr) {
      // The wrapper's braces go on their own lines: a trailing // comment in the
      // caller's snippet would otherwise comment out the closing `})()`.
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(async () => {\n${expr}\n})()`,
        awaitPromise: true, returnByValue: true
      });
      if (r.exceptionDetails) {
        throw new Error('page threw: ' + (r.exceptionDetails.exception?.description ||
          r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async waitFor(fn, label, timeout = 10000) {
      const start = Date.now();
      for (;;) {
        if (await fn()) return true;
        if (Date.now() - start > timeout) { t.check(false, `timed out waiting for ${label}`); return false; }
        await sleep(100);
      }
    },
    /**
     * Navigate to a path, wait for the document to finish parsing, then for
     * `ready`. The parse wait is not optional: an element the caller checks for
     * can exist while the rest of the page is still streaming in, so a custom
     * condition alone would race the parser and see a half-built DOM.
     */
    async open(path, ready = null) {
      await cdp.send('Page.navigate', { url: base + path });
      await t.waitFor(() => t.eval(`return document.readyState !== 'loading'`).catch(() => false),
        `${path} to finish parsing`);
      if (ready) await t.waitFor(() => t.eval(ready).catch(() => false), `${path} to be ready`);
    },
    async key(key, code = key, vk = 0) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    },
    async phone(width = 375, height = 667) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
      await sleep(250);
    },
    async desktop() {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
    },
    /** Standard mobile-layout assertions every game page should pass. */
    async checkMobileLayout(selector) {
      await t.phone();
      const w = await t.eval(`return [document.documentElement.scrollWidth, window.innerWidth]`);
      t.check(w[0] <= w[1] + 1, 'no horizontal scroll at phone width', `scrollWidth=${w[0]} viewport=${w[1]}`);
      const box = await t.eval(`
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.right), window.innerWidth];`);
      t.check(box && box[0] >= -1 && box[1] <= box[2] + 1,
        'the board stays inside the viewport at phone width', JSON.stringify(box));
      t.check(await t.eval(`
        return [...document.querySelectorAll('.btn, select')]
          .every(el => el.getBoundingClientRect().height >= 36);`),
        'controls keep a usable tap height at phone width');
      await t.desktop();
    },
    ignoreConsole(re) { t._ignore = re; }
  };

  console.log(`\n${name} — serving ${root} on ${base}\n`);

  try {
    await body(t);
    const errs = consoleErrors.filter(e => !(t._ignore && t._ignore.test(e)));
    t.check(errs.length === 0, 'no console errors or warnings', errs.join(' | '));
    t.check(failedRequests.length === 0, 'no failed requests', failedRequests.join(' | '));
  } catch (err) {
    console.error(err);
    failures++;
  } finally {
    chrome.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
