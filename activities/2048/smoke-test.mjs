/**
 * Smoke test for 2048.
 *
 *   node activities/2048/smoke-test.mjs
 *
 * Drives the board through deterministic positions (window.__2048.set) so the
 * merge rules can be asserted exactly, then plays it through the keyboard.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/2048/';
const GRID = `return window.__2048.grid;`;
const STATE = `return window.__2048.state;`;
const set = g => `window.__2048.set(${JSON.stringify(g)}); return 1;`;

// A board with a single row is easiest to reason about. Every accepted move also
// spawns a tile in a random empty cell, which can land in the row under test — so
// assertions only look at the cells the move itself filled, never the empties
// beside them.
const row = (g, r) => g.slice(r * 4, r * 4 + 4);
const head = (g, ...want) => JSON.stringify(g.slice(0, want.length)) === JSON.stringify(want);

runSuite('2048', async (t) => {
  await t.open(PAGE, `return !!window.__2048`);

  t.check(await t.eval(`return document.title.includes('2048')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.tf-tile').length === 16`),
    'the board is 4×4');
  t.check(await t.eval(`return window.__2048.grid.filter(Boolean).length === 2`),
    'a new game starts with two tiles');
  t.check(await t.eval(`return window.__2048.grid.filter(Boolean).every(v => v === 2 || v === 4)`),
    'starting tiles are 2s or 4s');

  // ---------------------------------------------------------------- merging
  await t.eval(set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check((await t.eval(GRID))[0] === 4, 'two equal tiles merge into one of the next');
  t.check((await t.eval(STATE)).score === 4, 'the merged value is added to the score');

  await t.eval(set([2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check(head(await t.eval(GRID), 4, 4),
    'a row of four makes two pairs, not one tile of eight');

  await t.eval(set([4, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check(head(await t.eval(GRID), 4, 4),
    'merging resolves from the leading edge');

  await t.eval(set([2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check(head(await t.eval(GRID), 2, 4),
    'unlike tiles do not merge');

  // A tile created by a merge cannot merge again in the same move.
  await t.eval(set([4, 4, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check(head(await t.eval(GRID), 8, 8),
    'a freshly merged tile does not merge twice in one move');

  // ------------------------------------------------------------- direction
  await t.eval(set([2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('right'); return 1;`);
  t.check((await t.eval(GRID))[3] === 4, 'sliding right packs against the right edge');

  await t.eval(set([2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('up'); return 1;`);
  t.check((await t.eval(GRID))[0] === 4, 'sliding up merges a column');

  await t.eval(set([2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('down'); return 1;`);
  t.check((await t.eval(GRID))[12] === 4, 'sliding down merges to the bottom');

  // --------------------------------------------------------- no-op moves
  await t.eval(set([2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const beforeMoves = (await t.eval(STATE)).moves;
  const moved = await t.eval(`return window.__2048.move('left');`);
  t.check(moved === false, 'a move that changes nothing is rejected');
  t.check((await t.eval(STATE)).moves === beforeMoves, 'a rejected move does not count');
  t.check(await t.eval(`return window.__2048.grid.filter(Boolean).length === 4`),
    'a rejected move does not spawn a tile');

  // ---------------------------------------------------------- game over
  await t.eval(set([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]));
  t.check((await t.eval(STATE)).over === true, 'a gridlocked board ends the game');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('No moves left'),
    'the game-over message explains why');
  t.check(await t.eval(`return window.__2048.move('left') === false`),
    'no moves are accepted once the game is over');

  // ------------------------------------------------------------ win state
  await t.eval(`document.getElementById('new').click(); return 1;`);
  await t.eval(set([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  t.check((await t.eval(STATE)).won === true, 'reaching 2048 wins');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('2048'),
    'the win message calls it out');
  t.check(await t.eval(`return window.__2048.move('left') !== undefined`),
    'play continues after the win');

  // ----------------------------------------------------------------- undo
  await t.eval(`document.getElementById('new').click(); return 1;`);
  t.check(await t.eval(`return document.getElementById('undo').disabled`),
    'undo is unavailable on a fresh board');
  await t.eval(set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`window.__2048.move('left'); return 1;`);
  const afterMerge = await t.eval(STATE);
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(JSON.stringify(row(await t.eval(GRID), 0)) === JSON.stringify([2, 2, 0, 0]),
    'undo restores the previous board');
  t.check((await t.eval(STATE)).score === afterMerge.score - 4, 'undo rolls the score back');
  t.check(await t.eval(`return document.getElementById('undo').disabled`),
    'undo only goes back one move');

  // -------------------------------------------------------------- keyboard
  await t.eval(`document.getElementById('new').click(); return 1;`);
  await t.eval(set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.key('ArrowLeft', 'ArrowLeft', 37);
  t.check((await t.eval(GRID))[0] === 4, 'ArrowLeft slides the board');
  await t.eval(set([2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.key('d', 'KeyD', 68);
  t.check((await t.eval(GRID))[3] === 4, 'WASD works too');

  // ------------------------------------------------------------ direction pad
  await t.eval(set([2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  await t.eval(`document.querySelector('.tf-pad [data-dir="left"]').click(); return 1;`);
  t.check((await t.eval(GRID))[0] === 4, 'the on-screen pad slides the board');

  // ------------------------------------------------------------------ best
  const best = await t.eval(`return Number(document.getElementById('best').textContent);`);
  t.check(best >= (await t.eval(STATE)).score, 'the best score tracks the run');
  await t.open(PAGE, `return !!window.__2048`);
  t.check(await t.eval(`return Number(document.getElementById('best').textContent) === ${best}`),
    'the best score survives a reload');

  // ---------------------------------------------------------------- a11y
  t.check(await t.eval(
    `return document.querySelector('.tf-tile').getAttribute('aria-label').includes('Row 1 column 1')`),
    'tiles announce their position and value');

  // -------------------------------------------------------------- mobile
  await t.checkMobileLayout('#board');
  await t.phone();
  t.check(await t.eval(`
    return getComputedStyle(document.querySelector('.tf-pad')).display !== 'none';`),
    'the direction pad is offered at phone width');
  t.check(await t.eval(`
    return [...document.querySelectorAll('.tf-pad button')]
      .every(b => b.getBoundingClientRect().height >= 44);`),
    'the direction pad has 44px tap targets');
  await t.desktop();
  t.check(await t.eval(`
    return getComputedStyle(document.querySelector('.tf-pad')).display === 'none';`),
    'the direction pad is hidden on a wide screen where keys work');

  // ---------------------------------------------------------- index links
  await t.open('/activities/', `return !!document.getElementById('cards')`);
  t.check(await t.eval(`return !!document.querySelector('#cards a[href="2048/"]')`),
    'the activities index links to 2048');
});
