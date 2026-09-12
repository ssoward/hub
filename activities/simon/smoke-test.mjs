/**
 * Smoke test for Simon.
 *
 *   node activities/simon/smoke-test.mjs
 *
 * The sequence is seeded through window.__simon.seed so the playback can be
 * asserted without waiting on (or guessing) a random one.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/simon/';
const STATE = `return window.__simon.state;`;
const MSG = `return document.getElementById('msg').textContent;`;

runSuite('Simon', async (t) => {
  await t.open(PAGE, `return !!window.__simon`);
  // Headless Chrome has no audio device; the page already swallows that, but
  // the autoplay policy can still log a warning before the first gesture.
  t.ignoreConsole(/AudioContext|autoplay/i);

  t.check(await t.eval(`return document.title.includes('Simon')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.sm-pad').length === 4`), 'four pads');
  t.check(await t.eval(`
    return ['green','red','yellow','blue'].every(p => !!document.querySelector('[data-pad="' + p + '"]'));`),
    'the four pads are the classic colours');
  t.check((await t.eval(MSG)).includes('Start'), 'the board invites you to start');
  t.check(await t.eval(`return document.getElementById('replay').disabled`),
    'replay is unavailable before a game starts');

  // Presses are ignored until it is actually your turn.
  t.check(await t.eval(`return !window.__simon.state.accepting`), 'input is closed before a round');
  await t.eval(`window.__simon.press('green'); return 1;`);
  t.check((await t.eval(STATE)).at === 0, 'a press before the sequence plays is ignored');

  // ------------------------------------------------------- playing a round
  await t.eval(`window.__simon.seed(['green', 'red', 'yellow']); return 1;`);
  t.check((await t.eval(STATE)).round === 3, 'the round number follows the sequence length');
  t.check(await t.eval(`return Number(document.getElementById('round').textContent) === 3`),
    'the round pill shows the sequence length');

  await t.eval(`window.__simon.press('green'); return 1;`);
  t.check((await t.eval(STATE)).at === 1, 'a correct press advances the sequence');
  await t.eval(`window.__simon.press('red'); return 1;`);
  await t.eval(`window.__simon.press('yellow'); return 1;`);
  t.check((await t.eval(MSG)).includes('Round 3 cleared'), 'finishing the sequence clears the round');
  t.check(await t.eval(`return !window.__simon.state.accepting`),
    'input closes while the next round is dealt');

  // The next round is one longer.
  await t.waitFor(() => t.eval(`return window.__simon.state.round === 4`), 'the next round');
  t.check(true, 'the next round adds one colour');

  // ------------------------------------------- a wrong press, normal mode
  await t.eval(`window.__simon.seed(['green', 'red']); return 1;`);
  await t.eval(`window.__simon.press('blue'); return 1;`);
  t.check((await t.eval(MSG)).includes('watch again'), 'normal mode replays after a mistake');
  t.check((await t.eval(STATE)).round === 2, 'normal mode keeps the same sequence');
  t.check((await t.eval(STATE)).running === true, 'normal mode keeps the game alive');

  // ------------------------------------------- a wrong press, strict mode
  await t.eval(`const m = document.getElementById('mode'); m.value = 'strict';
    m.dispatchEvent(new Event('change')); return 1;`);
  await t.eval(`window.__simon.seed(['green', 'red', 'yellow', 'blue']); return 1;`);
  await t.eval(`window.__simon.press('red'); return 1;`);
  t.check((await t.eval(STATE)).running === false, 'strict mode ends on the first mistake');
  t.check((await t.eval(MSG)).includes('reached round') || (await t.eval(MSG)).includes('new best'),
    'the end message reports how far you got');
  t.check(await t.eval(`return document.getElementById('start').textContent === 'Start'`),
    'the button offers a fresh start after a loss');
  await t.eval(`window.__simon.press('green'); return 1;`);
  t.check((await t.eval(STATE)).at === 0, 'presses are ignored after a loss');

  // ---------------------------------------------------------------- best
  t.check(await t.eval(`return Number(document.getElementById('best').textContent) >= 3`),
    'the best round is recorded');
  const best = await t.eval(`return Number(document.getElementById('best').textContent);`);
  await t.open(PAGE, `return !!window.__simon`);
  t.check(await t.eval(`return Number(document.getElementById('best').textContent) === ${best}`),
    'the best round survives a reload');

  // ------------------------------------------------------------- keyboard
  await t.eval(`window.__simon.seed(['green', 'blue']); return 1;`);
  await t.key('1', 'Digit1', 49);
  t.check((await t.eval(STATE)).at === 1, 'key 1 presses the green pad');
  await t.key('4', 'Digit4', 52);
  t.check((await t.eval(MSG)).includes('cleared'), 'key 4 presses the blue pad');

  // ------------------------------------------------------ start sequences
  await t.eval(`document.getElementById('start').click(); return 1;`);
  t.check(await t.eval(`return window.__simon.state.running`), 'Start begins a game');
  await t.waitFor(() => t.eval(`return window.__simon.state.round === 1`), 'the first round');
  t.check(await t.eval(`return window.__simon.sequence.length === 1`), 'round one is a single colour');
  await t.waitFor(() => t.eval(`return window.__simon.state.accepting`), 'playback to finish');
  t.check(await t.eval(`return !document.querySelector('.sm-pad.lit')`),
    'the pads go dark once playback ends');
  t.check(await t.eval(`return !document.getElementById('replay').disabled`),
    'the sequence can be replayed on your turn');

  // -------------------------------------------------------------- mobile
  await t.checkMobileLayout('#board');
  await t.phone();
  t.check(await t.eval(`
    return [...document.querySelectorAll('.sm-pad')]
      .every(p => p.getBoundingClientRect().width >= 60 && p.getBoundingClientRect().height >= 60);`),
    'the pads stay large enough to hit on a phone');
  await t.desktop();
});
