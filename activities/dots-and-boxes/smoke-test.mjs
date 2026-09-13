/**
 * Smoke test for Dots and Boxes.
 *
 *   node activities/dots-and-boxes/smoke-test.mjs
 *
 * Covers drawing lines, the "claim a box and go again" rule, the final result,
 * and Undo — which has to give the box back to whoever claimed it and put that
 * player back on turn, since claiming does not pass the turn.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/dots-and-boxes/';
const STATE = `return window.__dots.state;`;
const MSG = `return document.getElementById('msg').textContent;`;
const UNDO_OFF = `return document.getElementById('undo').disabled;`;
const take = (...moves) =>
  moves.map(([k, r, c]) => `window.__dots.take('${k}',${r},${c});`).join(' ') + ' return 1;';

// The four sides of box (0,0): h(0,0) top, h(1,0) bottom, v(0,0) left, v(0,1) right.
const BOX00 = [['h', 0, 0], ['v', 0, 0], ['v', 0, 1], ['h', 1, 0]];

runSuite('Dots and Boxes', async (t) => {
  await t.open(PAGE, `return !!window.__dots`);

  t.check(await t.eval(`return document.title.includes('Dots and Boxes')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.db-dot').length === 25`),
    'a 5×5 grid of dots');
  t.check(await t.eval(`return document.querySelectorAll('.db-line').length === 40`),
    'forty lines can be drawn between them');
  t.check(await t.eval(UNDO_OFF), 'undo is unavailable before the first line');

  // ------------------------------------------------------- drawing a line
  await t.eval(take(['h', 0, 0]));
  t.check((await t.eval(STATE)).lines === 1, 'a line is drawn');
  t.check((await t.eval(STATE)).player === 2, 'a line that claims nothing passes the turn');
  t.check(await t.eval(`return document.querySelectorAll('.db-line.taken').length === 1`),
    'the drawn line is marked taken');
  t.check(!(await t.eval(UNDO_OFF)), 'undo lights up');

  await t.eval(take(['h', 0, 0]));
  t.check((await t.eval(STATE)).lines === 1, 'drawing over a taken line does nothing');
  t.check((await t.eval(STATE)).player === 2, 'and does not pass the turn');

  // ------------------------------------------ claiming a box keeps the turn
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(take(...BOX00.slice(0, 3)));
  const before = await t.eval(STATE);
  t.check(before.scores[1] === 0 && before.scores[2] === 0, 'three sides claim nothing');
  t.check(before.player === 2, 'the turn has alternated three times');

  await t.eval(take(BOX00[3]));
  const claimed = await t.eval(STATE);
  t.check(claimed.scores[2] === 1, 'the fourth side claims the box for whoever drew it');
  t.check(claimed.boxes[0][0] === 2, 'the box is recorded against that player');
  t.check(claimed.player === 2, 'claiming a box means another go');
  t.check(await t.eval(`return document.getElementById('s2').textContent === '1'`),
    'the scoreboard shows it');
  t.check(await t.eval(`return document.querySelectorAll('.db-box').length === 1`),
    'the box is labelled on the board');

  // ------------------------------------------------------- undo a claim
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  const undone = await t.eval(STATE);
  t.check(undone.scores[2] === 0, 'undo takes the box back off the score');
  t.check(undone.boxes[0][0] === 0, 'the box is unclaimed');
  t.check(undone.lines === 3, 'the line is removed');
  t.check(undone.player === 2, 'the player who drew it is on turn again');
  t.check(await t.eval(`return document.querySelectorAll('.db-box').length === 0`),
    'the label is cleared from the board');
  t.check(await t.eval(`return document.getElementById('s2').textContent === '0'`),
    'the scoreboard follows');

  // The same box can then be claimed again.
  await t.eval(take(BOX00[3]));
  t.check((await t.eval(STATE)).scores[2] === 1, 'the box can be claimed again after an undo');

  // --------------------------------------------- undo restores the turn
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(take(['h', 0, 0]));
  t.check((await t.eval(STATE)).player === 2, 'Player 1 drew, so Player 2 is up');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(STATE)).player === 1, 'undo hands the turn back to Player 1');
  t.check((await t.eval(STATE)).lines === 0, 'the board is empty again');
  t.check(await t.eval(UNDO_OFF), 'undo switches off with nothing left to take back');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(STATE)).lines === 0, 'a further undo is harmless');
  t.check(await t.eval(`return document.getElementById('turn-pill').textContent.includes('Player 1')`),
    'the turn pill agrees');

  // --------------------------------------------------------- a full game
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(`
    // Draw every line: all sixteen boxes get claimed by somebody.
    for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) window.__dots.take('h', r, c);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) window.__dots.take('v', r, c);
    return 1;`);
  const end = await t.eval(STATE);
  t.check(end.lines === 40, 'every line ends up drawn');
  t.check(end.scores[1] + end.scores[2] === 16, 'all sixteen boxes are claimed');
  t.check(/wins|Draw/.test(await t.eval(MSG)), 'the game announces a result', await t.eval(MSG));

  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(MSG) === '', 'undo clears the result message');
  t.check((await t.eval(STATE)).scores[1] + (await t.eval(STATE)).scores[2] < 16,
    'and gives the last box back');

  // --------------------------------------------------------- new game
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  const fresh = await t.eval(STATE);
  t.check(fresh.lines === 0 && fresh.scores[1] === 0 && fresh.scores[2] === 0 && fresh.player === 1,
    'New game clears the board, the scores and the turn');
  t.check(await t.eval(UNDO_OFF), 'and undo starts off again');

  // ------------------------------------------------------------- keyboard
  t.check(await t.eval(`return document.querySelectorAll('.db-hit[tabindex="0"]').length === 40`),
    'every undrawn line is reachable by keyboard');
  t.check((await t.eval(`return document.querySelector('.db-hit').getAttribute('aria-label')`))
    .includes('row 1'), 'and says which line it draws');
  await t.eval(`document.querySelector('.db-hit').focus(); return 1;`);
  await t.key('Enter', 'Enter', 13);
  t.check((await t.eval(STATE)).lines === 1, 'Enter draws the focused line');
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(`document.querySelector('.db-hit').focus(); return 1;`);
  await t.key(' ', 'Space', 32);
  t.check((await t.eval(STATE)).lines === 1, 'Space draws it too');
  await t.eval(`document.getElementById('reset').click(); return 1;`);

  // -------------------------------------------------------------- mobile
  // The svg has a viewBox but no width attribute, and inside the centred column
  // flex container that used to resolve to 0×0 on a phone — the whole board
  // collapsed and the game could not be played at all.
  await t.checkMobileLayout('.db-board');
  await t.phone();
  const size = await t.eval(`
    const r = document.getElementById('svg').getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height), Math.round(r.right), window.innerWidth];`);
  t.check(size[0] > 240 && size[1] > 240, 'the board keeps its size on a phone', JSON.stringify(size));
  t.check(size[2] <= size[3] + 1, 'and still fits the viewport', JSON.stringify(size));
  // getBoundingClientRect on an SVG <line> excludes the stroke — a horizontal
  // line measures zero high — so probe what a tap would actually land on.
  const reach = await t.eval(`
    const hit = document.querySelector('.db-hit');
    const r = hit.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let off = 0;
    /* how far off-centre a tap still lands on this line */
    while (off < 40 && document.elementFromPoint(cx, cy + off + 1) === hit) off++;
    return off * 2;
  `);
  t.check(reach >= 14, 'a tap lands on the line from several pixels either side', `${reach}px`);
  await t.eval(`document.querySelector('.db-hit').dispatchEvent(new MouseEvent('click', {bubbles: true})); return 1;`);
  t.check((await t.eval(STATE)).lines === 1, 'lines can still be drawn on a phone');
  t.check(await t.eval(`
    return document.getElementById('undo').getBoundingClientRect().height >= 36;`),
    'the undo button keeps a usable tap height');
  await t.desktop();
});
