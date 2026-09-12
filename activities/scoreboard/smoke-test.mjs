/**
 * Smoke test for the Scoreboard activity.
 *
 *   node activities/scoreboard/smoke-test.mjs
 *
 * Exercises increment, decrement, the step selector, undo, rename, add/remove,
 * reset, persistence across a reload, and the phone layout.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/scoreboard/';

const SCORES = `return [...document.querySelectorAll('.sb-value')].map(e => Number(e.textContent));`;
const NAMES = `return [...document.querySelectorAll('.sb-name')].map(e => e.value);`;
const tapScore = i => `document.querySelectorAll('.sb-score')[${i}].click(); return 1;`;
const tapMinus = i => `document.querySelectorAll('.sb-step.minus')[${i}].click(); return 1;`;
const tapPlus = i => `document.querySelectorAll('.sb-step.plus')[${i}].click(); return 1;`;

runSuite('Scoreboard', async (t) => {
  // ---------------------------------------------------------- load
  await t.open(PAGE, `return !!window.__scoreboard`);

  t.check(await t.eval(`return document.title.includes('Scoreboard')`), 'page title');
  t.check((await t.eval(SCORES)).length === 2, 'starts with two players');
  t.check((await t.eval(SCORES)).every(n => n === 0), 'both start at zero');

  // ----------------------------------------------------- increment
  await t.eval(tapScore(0));
  await t.eval(tapScore(0));
  await t.eval(tapScore(1));
  let scores = await t.eval(SCORES);
  t.check(scores[0] === 2 && scores[1] === 1, 'tapping a score increments it', JSON.stringify(scores));
  t.check((await t.eval(`return document.getElementById('leader').textContent`)) ===
    (await t.eval(NAMES))[0], 'the leader pill names the player in front');

  await t.eval(tapPlus(1));
  scores = await t.eval(SCORES);
  t.check(scores[1] === 2, 'the + button increments', JSON.stringify(scores));
  t.check((await t.eval(`return document.getElementById('leader').textContent`)) === 'tied',
    'an all-square board reads as tied');

  // ----------------------------------------------------- decrement
  await t.eval(tapMinus(0));
  scores = await t.eval(SCORES);
  t.check(scores[0] === 1, 'the − button decrements', JSON.stringify(scores));

  await t.eval(tapMinus(0));
  await t.eval(tapMinus(0));
  scores = await t.eval(SCORES);
  t.check(scores[0] === -1, 'scores may go negative', JSON.stringify(scores));

  // ---------------------------------------------------- step value
  await t.eval(`const s = document.getElementById('step'); s.value = '5';
    s.dispatchEvent(new Event('change')); return 1;`);
  await t.eval(tapScore(0));
  scores = await t.eval(SCORES);
  t.check(scores[0] === 4, 'the step selector changes the tap amount', JSON.stringify(scores));
  await t.eval(tapMinus(0));
  t.check((await t.eval(SCORES))[0] === -1, 'the step selector applies to − as well');
  await t.eval(`const s = document.getElementById('step'); s.value = '1';
    s.dispatchEvent(new Event('change')); return 1;`);

  // --------------------------------------------------------- undo
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(SCORES))[0] === 4, 'undo restores the previous score');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(SCORES))[0] === -1, 'undo unwinds repeatedly');

  // ------------------------------------------------ keyboard input
  await t.eval(`document.querySelectorAll('.sb-score')[1].focus(); return 1;`);
  await t.key('ArrowUp', 'ArrowUp', 38);
  t.check((await t.eval(SCORES))[1] === 3, 'ArrowUp on a focused score adds a point');
  t.check(await t.eval(`return document.activeElement.classList.contains('sb-score')`),
    'focus stays on the score after it changes');
  await t.key('ArrowDown', 'ArrowDown', 40);
  t.check((await t.eval(SCORES))[1] === 2, 'ArrowDown takes one back');

  // ------------------------------------------------- add / rename / remove
  await t.eval(`document.getElementById('add').click(); return 1;`);
  t.check((await t.eval(SCORES)).length === 3, 'Add player adds a card');
  await t.eval(`const n = document.querySelectorAll('.sb-name')[2];
    n.value = 'Cougars'; n.dispatchEvent(new Event('change')); return 1;`);
  t.check((await t.eval(NAMES))[2] === 'Cougars', 'a player can be renamed');
  t.check(await t.eval(
    `return document.querySelectorAll('.sb-remove')[2].getAttribute('aria-label') === 'Remove Cougars'`),
    'the remove button relabels with the new name');

  await t.eval(`document.querySelectorAll('.sb-remove')[0].click(); return 1;`);
  t.check((await t.eval(SCORES)).length === 2, 'a player can be removed');
  t.check((await t.eval(NAMES)).includes('Cougars'), 'removing takes out the right card');

  // -------------------------------------------------------- reset
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  t.check((await t.eval(SCORES)).every(n => n === 0), 'Reset scores zeroes every card');
  t.check((await t.eval(NAMES)).includes('Cougars'), 'Reset scores keeps the names');

  // -------------------------------------------------- persistence
  await t.eval(tapScore(1));
  await t.eval(tapScore(1));
  const savedScores = await t.eval(SCORES);
  const savedNames = await t.eval(NAMES);
  await t.open(PAGE, `return !!window.__scoreboard`);
  t.check(JSON.stringify(await t.eval(SCORES)) === JSON.stringify(savedScores),
    'scores survive a reload');
  t.check(JSON.stringify(await t.eval(NAMES)) === JSON.stringify(savedNames),
    'names survive a reload');

  // ------------------------------------------------------- mobile
  await t.phone();
  t.check(await t.eval(`return document.documentElement.scrollWidth <= window.innerWidth + 1`),
    'no horizontal scroll at 375px',
    `scrollWidth=${await t.eval(`return document.documentElement.scrollWidth`)}`);
  t.check(await t.eval(`
    return [...document.querySelectorAll('.sb-score, .sb-step, .sb-remove, .btn')]
      .every(el => el.getBoundingClientRect().height >= 40);`),
    'every tap target is at least 40px tall at phone width');
  t.check(await t.eval(`
    const r = document.querySelector('.sb-player').getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1;`),
    'player cards stay inside the viewport at phone width');
  // The whole board should be reachable without pinching: a tap still scores.
  await t.eval(tapScore(0));
  t.check((await t.eval(SCORES))[0] === savedScores[0] + 1, 'tapping still scores on mobile');

  await t.desktop();

  // ------------------------------------------------ clear + index link
  await t.eval(`document.getElementById('clear').click(); return 1;`);
  t.check((await t.eval(SCORES)).length === 2 && (await t.eval(SCORES)).every(n => n === 0),
    'Clear all returns a fresh two-player board');

  await t.open('/', `return !!document.getElementById('cards')`);
  t.check(await t.eval(
    `return !!document.querySelector('#cards a[href="activities/scoreboard/"]')`),
    'the home page links to the scoreboard');

  await t.open('/activities/', `return !!document.getElementById('cards')`);
  t.check(await t.eval(
    `return !!document.querySelector('#cards a[href="scoreboard/"]')`),
    'the activities index links to the scoreboard');
});
