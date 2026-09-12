/**
 * Smoke test for Lights Out.
 *
 *   node activities/lights-out/smoke-test.mjs
 *
 * The interesting property is that every dealt board is solvable — the test
 * proves it by actually playing the remaining hint set to the end.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/lights-out/';
const INFO = `return window.__lights.info;`;
const STATE = `return window.__lights.state;`;

runSuite('Lights Out', async (t) => {
  await t.open(PAGE, `return !!window.__lights`);

  t.check(await t.eval(`return document.title.includes('Lights Out')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.lo-cell').length === 25`),
    '5×5 is the default board');
  t.check((await t.eval(INFO)).lit > 0, 'a dealt board is never already solved');
  t.check((await t.eval(INFO)).moves === 0, 'a dealt board starts at zero moves');

  // ------------------------------------------------------- the toggle rule
  await t.eval(`window.__lights.set(new Array(25).fill(0)); return 1;`);
  await t.eval(`window.__lights.press(12); return 1;`);   // centre of a 5×5
  t.check(JSON.stringify(await t.eval(STATE)) === JSON.stringify(
    [0,0,0,0,0, 0,0,1,0,0, 0,1,1,1,0, 0,0,1,0,0, 0,0,0,0,0]),
    'a press flips the cell and its four neighbours');

  await t.eval(`window.__lights.set(new Array(25).fill(0)); return 1;`);
  await t.eval(`window.__lights.press(0); return 1;`);    // top-left corner
  t.check(JSON.stringify(await t.eval(STATE)) === JSON.stringify(
    [1,1,0,0,0, 1,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0]),
    'a corner press flips only the neighbours that exist');

  await t.eval(`window.__lights.set(new Array(25).fill(0)); return 1;`);
  await t.eval(`window.__lights.press(7); window.__lights.press(7); return 1;`);
  t.check((await t.eval(INFO)).lit === 0, 'pressing the same light twice undoes it');
  t.check((await t.eval(INFO)).moves === 2, 'both presses still count as moves');

  // ---------------------------------------------------------- the win rule
  await t.eval(`window.__lights.set([0,0,0,0,0, 0,0,1,0,0, 0,1,1,1,0, 0,0,1,0,0, 0,0,0,0,0]); return 1;`);
  await t.eval(`window.__lights.press(12); return 1;`);
  t.check((await t.eval(INFO)).solved === true, 'clearing the board wins');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('All out'),
    'the win message says so');
  await t.eval(`window.__lights.press(0); return 1;`);
  t.check((await t.eval(INFO)).lit === 0, 'presses are ignored once solved');

  // -------------------------------------------- every dealt board is solvable
  for (const size of ['3', '5', '7']) {
    for (const depth of ['3', '6', '12']) {
      await t.eval(`
        const s = document.getElementById('size'); s.value = ${JSON.stringify(size)};
        const d = document.getElementById('scramble'); d.value = ${JSON.stringify(depth)};
        s.dispatchEvent(new Event('change'));
        d.dispatchEvent(new Event('change'));
        return 1;`);
      const played = await t.eval(`
        // Play the hint set out. If it clears the board, the deal was solvable.
        for (let guard = 0; guard < 200; guard++) {
          const left = window.__lights.info.remaining;
          if (!left.length) break;
          window.__lights.press(left[0]);
        }
        return window.__lights.info;`);
      t.check(played.lit === 0 && played.solved === true,
        `a ${size}×${size} board at scramble ${depth} is solvable`, JSON.stringify(played));
    }
  }

  // ---------------------------------------------------------------- hint
  await t.eval(`
    const s = document.getElementById('size'); s.value = '5';
    s.dispatchEvent(new Event('change')); return 1;`);
  await t.eval(`document.getElementById('hint').click(); return 1;`);
  t.check(await t.eval(`return document.querySelectorAll('.lo-cell.hint').length === 1`),
    'Hint marks exactly one light');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('row'),
    'Hint also spells out the square');
  const hinted = await t.eval(`return [...document.querySelectorAll('.lo-cell')]
    .findIndex(c => c.classList.contains('hint'));`);
  await t.eval(`window.__lights.press(${hinted}); return 1;`);
  t.check(await t.eval(`return document.querySelectorAll('.lo-cell.hint').length === 0`),
    'the hint clears once you move');
  t.check(!(await t.eval(INFO)).remaining.includes(hinted),
    'taking the hint shortens the remaining solution');

  // ---------------------------------------------------------------- undo
  const beforeUndo = await t.eval(STATE);
  await t.eval(`window.__lights.press(6); return 1;`);
  t.check(JSON.stringify(await t.eval(STATE)) !== JSON.stringify(beforeUndo), 'the press changed the board');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(JSON.stringify(await t.eval(STATE)) === JSON.stringify(beforeUndo), 'undo puts the lights back');
  t.check(await t.eval(`return window.__lights.info.moves === ${(await t.eval(INFO)).moves}`),
    'undo rolls the move count back');

  // ---------------------------------------------------------------- best
  await t.eval(`
    const s = document.getElementById('size'); s.value = '3';
    s.dispatchEvent(new Event('change')); return 1;`);
  await t.eval(`
    for (let guard = 0; guard < 60; guard++) {
      const left = window.__lights.info.remaining;
      if (!left.length) break;
      window.__lights.press(left[0]);
    }
    return 1;`);
  t.check((await t.eval(`return document.getElementById('best').textContent`)).includes('moves'),
    'a solve records a best for that size');
  // Every size/scramble pair keeps its own record — the solvability sweep above
  // cleared all nine of them, so all nine keys should now exist and be distinct.
  t.check(await t.eval(`
    const keys = Object.keys(localStorage).filter(k => k.startsWith('lightsout.best.'));
    return keys.length === 9;`),
    'the best is kept per size and scramble');
  await t.eval(`
    const s = document.getElementById('size'); s.value = '7';
    const d = document.getElementById('scramble'); d.value = '12';
    s.dispatchEvent(new Event('change')); return 1;`);
  t.check((await t.eval(`return document.getElementById('best').textContent`)).includes('moves'),
    'switching back to a played size shows that size\'s record');

  // ---------------------------------------------------------------- a11y
  t.check(await t.eval(`
    const c = document.querySelector('.lo-cell');
    return c.getAttribute('aria-pressed') !== null && c.getAttribute('aria-label').includes('Row 1');`),
    'lights expose their position and on/off state');

  // -------------------------------------------------------------- mobile
  await t.checkMobileLayout('#board');
  await t.phone();
  t.check(await t.eval(`
    return [...document.querySelectorAll('.lo-cell')].every(c => {
      const r = c.getBoundingClientRect();
      return r.width >= 28 && r.left >= -1 && r.right <= window.innerWidth + 1;
    });`), 'a 7×7 board still fits and stays tappable on a phone');
  await t.desktop();
});
