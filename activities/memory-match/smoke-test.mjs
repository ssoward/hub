/**
 * Smoke test for Memory Match.
 *
 *   node activities/memory-match/smoke-test.mjs
 *
 * Covers the two defects this page shipped with — a 6-wide board that hung off
 * the left edge of a phone, and a pending unflip timer that leaked across
 * "New game" and stranded a card that could never be matched — plus the
 * ordinary flip/match/win flow.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const FLIPPED = `return document.querySelectorAll('.mm-card.flipped').length;`;
const MATCHED = `return document.querySelectorAll('.mm-card.matched').length;`;
const PAIRS = `return Number(document.getElementById('pairs').textContent);`;
const UNDO_OFF = `return document.getElementById('undo').disabled;`;
const MOVES = `return Number(document.getElementById('moves').textContent);`;

// Click the first face-down card, then its partner — a guaranteed match.
const MATCH_A_PAIR = `
  const cards = [...document.querySelectorAll('.mm-card:not(.matched):not(.flipped)')];
  const a = cards[0];
  const partner = cards.slice(1).find(c => c.dataset.icon === a.dataset.icon);
  a.click(); partner.click();
  return 1;`;

// Click two cards with different icons — a guaranteed mismatch.
const MISMATCH = `
  const cards = [...document.querySelectorAll('.mm-card:not(.matched):not(.flipped)')];
  const a = cards[0];
  const other = cards.find(c => c.dataset.icon !== a.dataset.icon);
  a.click(); other.click();
  return 1;`;

runSuite('Memory Match', async (t) => {
  await t.open('/activities/memory-match/', `return !!window.__memory`);

  t.check(await t.eval(`return document.title.includes('Memory Match')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.mm-card').length === 24`),
    '4×6 deals 24 cards');
  t.check(await t.eval(`
    const icons = [...document.querySelectorAll('.mm-card')].map(c => c.dataset.icon);
    const counts = {};
    icons.forEach(i => counts[i] = (counts[i] || 0) + 1);
    return Object.values(counts).every(n => n === 2) && Object.keys(counts).length === 12;`),
    'every icon is dealt exactly twice');

  // ------------------------------------------------------------- matching
  await t.eval(MATCH_A_PAIR);
  t.check(await t.eval(PAIRS) === 1, 'a matching pair scores a pair');
  t.check(await t.eval(MOVES) === 1, 'a match counts as one move');
  t.check(await t.eval(MATCHED) === 2, 'both cards stay face up');
  t.check(await t.eval(
    `return [...document.querySelectorAll('.mm-card.matched')].every(c => c.disabled)`),
    'matched cards are taken out of the tab order');

  // ---------------------------------------------------------- mismatching
  await t.eval(MISMATCH);
  t.check(await t.eval(FLIPPED) === 2, 'a mismatched pair shows briefly');
  t.check(await t.eval(MOVES) === 2, 'a mismatch counts as a move');
  await t.sleep(900);
  t.check(await t.eval(FLIPPED) === 0, 'a mismatched pair flips back');
  t.check(await t.eval(`return !window.__memory.state.lock`), 'the board unlocks after the flip back');

  // ------------------------------------------- the stale-timer regression
  // New game while a mismatch is still counting down used to null out `first`
  // in the *new* board, leaving a card flipped forever and unmatchable.
  await t.eval(MISMATCH);
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 0, 'New game deals a clean board');
  await t.eval(`document.querySelectorAll('.mm-card')[0].click(); return 1;`);
  await t.sleep(900); // the old board's 700ms unflip would have fired by now
  t.check(await t.eval(FLIPPED) === 1, 'the card picked after New game is still face up');
  await t.eval(`
    const cards = [...document.querySelectorAll('.mm-card')];
    const icon = cards[0].dataset.icon;
    cards.slice(1).find(c => c.dataset.icon === icon).click();
    return 1;`);
  t.check(await t.eval(PAIRS) === 1, 'that card can still be matched');
  t.check(await t.eval(MATCHED) === 2, 'the pair locks in');

  // -------------------------------------------------------- size + reset
  await t.eval(`const s = document.getElementById('size'); s.value = '4';
    s.dispatchEvent(new Event('change')); return 1;`);
  t.check(await t.eval(`return document.querySelectorAll('.mm-card').length === 16`),
    '4×4 deals 16 cards');
  t.check(await t.eval(`return document.getElementById('total').textContent === '8'`),
    'the pair total follows the size');
  t.check(await t.eval(PAIRS) === 0 && await t.eval(MOVES) === 0,
    'changing size starts a fresh count');

  // ------------------------------------------------------------ win + best
  await t.eval(`
    const board = document.getElementById('board');
    // Play the whole board out perfectly.
    for (let guard = 0; guard < 40; guard++) {
      const left = [...board.querySelectorAll('.mm-card:not(.matched)')];
      if (!left.length) break;
      const a = left[0];
      const partner = left.slice(1).find(c => c.dataset.icon === a.dataset.icon);
      a.click(); partner.click();
    }
    return 1;`);
  t.check(await t.eval(PAIRS) === 8, 'playing every pair wins the board');
  t.check(await t.eval(MOVES) === 8, 'a perfect game is eight moves');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('8 moves'),
    'the win message reports the move count');
  t.check((await t.eval(`return document.getElementById('best').textContent`)).includes('8'),
    'the best score is recorded');

  await t.open('/activities/memory-match/', `return !!window.__memory`);
  t.check((await t.eval(`return document.getElementById('best').textContent`)) === '—',
    'the best score is tracked per board size');

  // --------------------------------------------------------- a11y labels
  t.check((await t.eval(`return document.querySelector('.mm-card').getAttribute('aria-label')`))
    .includes('face down'), 'a face-down card announces itself as face down');
  await t.eval(`document.querySelectorAll('.mm-card')[0].click(); return 1;`);
  t.check(!(await t.eval(`return document.querySelector('.mm-card').getAttribute('aria-label')`))
    .includes('face down'), 'the label updates when a card is turned over');
  t.check(await t.eval(
    `return [...document.querySelectorAll('.mm-card .front, .mm-card .back')]
      .every(el => el.getAttribute('aria-hidden') === 'true')`),
    'the card faces are hidden from the accessibility tree');

  // ---------------------------------------------------------------- undo
  // A single level only: unwinding the whole board would defeat a memory game.
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  t.check(await t.eval(UNDO_OFF), 'undo is unavailable on a fresh board');

  // Take back a single turned card.
  await t.eval(`document.querySelectorAll('.mm-card')[0].click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 1, 'one card is face up');
  t.check(!(await t.eval(UNDO_OFF)), 'undo is offered');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 0, 'undo turns a single card back over');
  t.check(await t.eval(MOVES) === 0, 'it was not a move, so the count is untouched');
  t.check(await t.eval(UNDO_OFF), 'and undo switches off again');
  t.check((await t.eval(
    `return document.querySelector('.mm-card').getAttribute('aria-label')`)).includes('face down'),
    'the label goes back to face down');
  // The board is still live: the same card can be picked again.
  await t.eval(`document.querySelectorAll('.mm-card')[0].click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 1, 'the card can be turned over again');
  await t.eval(`document.getElementById('undo').click(); return 1;`);

  // Take back a match.
  await t.eval(MATCH_A_PAIR);
  t.check(await t.eval(PAIRS) === 1 && await t.eval(MOVES) === 1, 'a pair is matched');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(PAIRS) === 0, 'undo gives the pair back');
  t.check(await t.eval(MOVES) === 0, 'and refunds the move');
  t.check(await t.eval(MATCHED) === 0 && await t.eval(FLIPPED) === 0,
    'both cards go face down rather than staying up');
  t.check(await t.eval(
    `return [...document.querySelectorAll('.mm-card')].every(c => !c.disabled)`),
    'the cards are playable again');
  await t.eval(MATCH_A_PAIR);
  t.check(await t.eval(PAIRS) === 1, 'the same pair can be matched again');

  // Take back a mismatch, before it flips itself back.
  await t.eval(MISMATCH);
  t.check(await t.eval(FLIPPED) === 2, 'a mismatch is showing');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 0, 'undo flips a mismatch straight back');
  t.check(await t.eval(MOVES) === 1, 'and refunds that move too');
  t.check(await t.eval(`return !window.__memory.state.lock`), 'the board is unlocked');
  await t.sleep(900);
  t.check(await t.eval(FLIPPED) === 0, 'the cancelled flip-back timer does not fire later');
  await t.eval(`document.querySelectorAll('.mm-card:not(.matched)')[0].click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 1, 'play continues normally afterwards');

  // Once a mismatch has flipped back on its own there is nothing to take back.
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(MISMATCH);
  await t.sleep(900);
  t.check(await t.eval(UNDO_OFF), 'undo lapses once the mismatch has flipped back by itself');

  // Undo after a win reopens the board.
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(`
    for (let guard = 0; guard < 40; guard++) {
      const left = [...document.querySelectorAll('.mm-card:not(.matched)')];
      if (!left.length) break;
      const a = left[0];
      const partner = left.slice(1).find(c => c.dataset.icon === a.dataset.icon);
      a.click(); partner.click();
    }
    return 1;`);
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('Done'),
    'the board is won');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check(await t.eval(`return document.getElementById('msg').textContent`) === '',
    'undo clears the win message');
  t.check(await t.eval(PAIRS) === 11, 'and gives the last pair back');

  // -------------------------------------------------------------- mobile
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.checkMobileLayout('#board');
  await t.phone();
  t.check(await t.eval(`
    const cards = [...document.querySelectorAll('.mm-card')];
    return cards.every(c => {
      const r = c.getBoundingClientRect();
      return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width >= 24;
    });`), 'every card is fully on screen at phone width');
  // Deal fresh first: tapping a second card could otherwise land on the partner
  // of the one the a11y section turned over, matching it and clearing .flipped.
  await t.eval(`document.getElementById('reset').click(); return 1;`);
  await t.eval(`document.querySelectorAll('.mm-card')[0].click(); return 1;`);
  t.check(await t.eval(FLIPPED) === 1, 'cards still flip on a phone-sized viewport');
  await t.desktop();
});
