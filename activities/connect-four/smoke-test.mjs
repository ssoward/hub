/**
 * Smoke test for Connect Four.
 *
 *   node activities/connect-four/smoke-test.mjs
 *
 * Covers dropping, the win and draw rules, and the new Undo — including that it
 * takes back the computer's reply as well, reopens a finished game, and is not
 * offered while the computer is still to move.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/connect-four/';
const STATE = `return window.__c4.state;`;
const GRID = `return window.__c4.grid;`;
const MSG = `return document.getElementById('msg').textContent;`;
const UNDO_OFF = `return document.getElementById('undo').disabled;`;
const drop = (...cols) => cols.map(c => `window.__c4.play(${c});`).join(' ') + ' return 1;';
const filled = `return window.__c4.grid.flat().filter(Boolean).length;`;

runSuite('Connect Four', async (t) => {
  await t.open(PAGE, `return !!window.__c4`);

  t.check(await t.eval(`return document.title.includes('Connect Four')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.c4-cell').length === 42`),
    'the board is 7 columns by 6 rows');
  t.check(await t.eval(UNDO_OFF), 'undo is unavailable on an empty board');

  // ----------------------------------------------------------------- drops
  await t.eval(drop(3));
  t.check((await t.eval(GRID))[5][3] === 'r', 'a disc falls to the bottom of its column');
  t.check((await t.eval(STATE)).current === 'y', 'the turn passes');
  t.check(!(await t.eval(UNDO_OFF)), 'undo lights up after the first move');
  await t.eval(drop(3));
  t.check((await t.eval(GRID))[4][3] === 'y', 'the next disc stacks on top');

  // ---------------------------------------------------- undo, two players
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(GRID))[4][3] === null, 'undo lifts the last disc off');
  t.check((await t.eval(STATE)).current === 'y', 'and hands the turn back to whoever played it');
  t.check((await t.eval(STATE)).moves === 1, 'the move count drops by one');
  t.check(await t.eval(`
    return document.querySelectorAll('.c4-cell')[4 * 7 + 3].className === 'cell c4-cell';`),
    'the lifted cell is repainted empty');
  t.check((await t.eval(`
    return document.querySelectorAll('.c4-cell')[4 * 7 + 3].getAttribute('aria-label');`))
    .includes('empty'), 'and announces itself as empty again');

  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(filled) === 0, 'undo unwinds all the way to an empty board');
  t.check((await t.eval(STATE)).current === 'r', 'Red is to move again at the start');
  t.check(await t.eval(UNDO_OFF), 'undo switches itself off with nothing left to take back');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(filled) === 0, 'a further undo is harmless');

  // ------------------------------------------------ undo reopens a finish
  // Red takes the bottom row; Yellow stacks out of the way.
  await t.eval(drop(0, 0, 1, 1, 2, 2, 3));
  t.check((await t.eval(MSG)).includes('Red wins'), 'four in a row wins');
  t.check((await t.eval(STATE)).over === true, 'the game is marked over');
  t.check(await t.eval(`return document.querySelectorAll('.c4-cell.is-win').length === 4`),
    'the winning line is marked');
  t.check(await t.eval(`
    return [...document.querySelectorAll('.c4-cell')].every(b => b.disabled);`),
    'the board locks after a win');
  t.check(!(await t.eval(UNDO_OFF)), 'undo is still offered after the game ends');

  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(STATE)).over === false, 'undo reopens the finished game');
  t.check(await t.eval(MSG) === '', 'the win message is cleared');
  t.check(await t.eval(`return document.querySelectorAll('.c4-cell.is-win').length === 0`),
    'the winning-line marks are cleared');
  t.check(await t.eval(`
    return [...document.querySelectorAll('.c4-cell')].every(b => !b.disabled);`),
    'the board is playable again');
  t.check((await t.eval(STATE)).current === 'r', 'Red gets another go at the same move');
  await t.eval(drop(6));
  t.check(await t.eval(filled) === 7, 'and a different move can be played instead');

  // --------------------------------------------- undo against the computer
  await t.eval(`
    const box = document.getElementById('ai-toggle');
    box.checked = true; box.dispatchEvent(new Event('change'));
    return 1;`);
  t.check(await t.eval(filled) === 0, 'switching opponents starts a fresh board');

  await t.eval(drop(3));
  t.check(await t.eval(STATE).then(s => s.pending) === true,
    'the computer is queued to reply');
  t.check(await t.eval(UNDO_OFF), 'undo is withheld while the computer is still to move');
  await t.waitFor(() => t.eval(`return !window.__c4.state.pending`), 'the computer to reply');
  t.check(await t.eval(filled) === 2, 'the computer answers');
  t.check((await t.eval(STATE)).current === 'r', 'and hands the turn back');
  t.check(!(await t.eval(UNDO_OFF)), 'undo is available once it has moved');

  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(filled) === 0, 'undo takes back the computer\'s reply as well as your move');
  t.check((await t.eval(STATE)).current === 'r', 'so it is your turn again, not the computer\'s');
  t.check(await t.eval(UNDO_OFF), 'and undo switches off at the start of the game');
  await t.sleep(400);
  t.check(await t.eval(filled) === 0, 'no queued computer move lands after the undo');

  // ------------------------------------- New game cancels a queued reply
  // The computer's move was scheduled on a timer that used to survive a reset,
  // so it would drop a disc into the next game out of turn.
  await t.eval(drop(3));
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  t.check(await t.eval(filled) === 0, 'New game clears the board');
  await t.sleep(500);
  t.check(await t.eval(filled) === 0, 'and the queued computer reply does not land in it');
  t.check((await t.eval(STATE)).current === 'r', 'the new game is still Red to move');

  // ---------------------------------------------------------------- draw
  await t.eval(`
    const box = document.getElementById('ai-toggle');
    box.checked = false; box.dispatchEvent(new Event('change'));
    return 1;`);
  await t.eval(`
    // Fill the board in a pattern that makes no four in a row.
    const cols = [0,0,0,1,1,1,2,2,2,3,3,3,3,2,2,2,1,1,1,0,0,0,
                  4,4,4,5,5,5,6,6,6,6,5,5,5,4,4,4];
    for (const c of cols) { if (!window.__c4.state.over) window.__c4.play(c); }
    return 1;`);
  const end = await t.eval(STATE);
  t.check(end.over === true, 'the board plays out to a finish', JSON.stringify(end));
  t.check(!(await t.eval(UNDO_OFF)), 'undo is offered at the end of that game too');

  // -------------------------------------------------------------- mobile
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.checkMobileLayout('#board');
  await t.phone();
  await t.eval(`document.querySelectorAll('.c4-cell')[3].click(); return 1;`);
  t.check(await t.eval(filled) === 1, 'columns still drop on a phone');
  t.check(await t.eval(`
    return document.getElementById('undo').getBoundingClientRect().height >= 36;`),
    'the undo button keeps a usable tap height');
  await t.desktop();
});
