/**
 * Encrypt a standalone HTML page into a password-gated page for GitHub Pages.
 *
 *   node tools/encrypt-page.mjs <plain.html> <out.html> <password-file>
 *
 * The output holds only AES-256-GCM ciphertext (key from PBKDF2-SHA256,
 * 600k iterations, random salt and IV) plus a small unlock form. The browser
 * decrypts with WebCrypto and swaps in the page. Never commit the plaintext
 * or the password file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [src, out, pwFile] = process.argv.slice(2);
if (!src || !out || !pwFile) { console.error('usage: encrypt-page.mjs <plain.html> <out.html> <password-file>'); process.exit(1); }

const ITER = 600000;
const password = readFileSync(pwFile, 'utf8').replace(/\r?\n$/, '');
const plain = readFileSync(src, 'utf8');
const title = (plain.match(/<title>([^<]*)<\/title>/i) || [, 'Private page'])[1];
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
const b64 = u => Buffer.from(u).toString('base64');

writeFileSync(out, `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
:root { --bg: #f5f6f8; --surface: #fff; --ink: #141a26; --muted: #5a6478; --line: #dde1e8; --accent: #0039a6; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0f131b; --surface: #171c27; --ink: #e8ebf2; --muted: #9aa4b8; --line: #2a3140; --accent: #7ea2ff; --bad: #ff8a80; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #0f131b; --surface: #171c27; --ink: #e8ebf2; --muted: #9aa4b8; --line: #2a3140; --accent: #7ea2ff; --bad: #ff8a80; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
form { width: 100%; max-width: 360px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 22px; display: grid; gap: 12px; }
h1 { margin: 0; font-size: 1.15rem; }
p { margin: 0; color: var(--muted); font-size: .9rem; }
input { font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); }
button { font: inherit; font-weight: 600; padding: 10px; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#err { color: var(--bad); min-height: 1.2em; }
a { color: var(--accent); font-size: .85rem; }
</style>
</head>
<body>
<form id="f">
  <h1>🔒 ${title}</h1>
  <p>This page is encrypted. Enter the password to open it.</p>
  <input id="pw" type="password" autocomplete="current-password" aria-label="Password" autofocus required>
  <button id="go">Unlock</button>
  <p id="err" role="alert"></p>
  <a href="../">&larr; Public version</a>
</form>
<script>
const D = { salt: "${b64(salt)}", iv: "${b64(iv)}", iter: ${ITER}, ct: "${b64(ct)}" };
const u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
document.getElementById('f').addEventListener('submit', async e => {
  e.preventDefault();
  const go = document.getElementById('go'), err = document.getElementById('err');
  go.disabled = true; go.textContent = 'Unlocking…'; err.textContent = '';
  try {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(document.getElementById('pw').value), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: u8(D.salt), iterations: D.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const html = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8(D.iv) }, key, u8(D.ct)));
    document.open(); document.write(html); document.close();
  } catch {
    err.textContent = 'Wrong password.'; go.disabled = false; go.textContent = 'Unlock';
  }
});
</script>
</body>
</html>
`);
console.log(`wrote ${out} (${ct.length} bytes ciphertext)`);
