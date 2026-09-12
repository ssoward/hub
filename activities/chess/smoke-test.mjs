/**
 * Smoke test for Chess.
 *
 *   node activities/chess/smoke-test.mjs
 *
 * The engine is checked against published perft node counts — the standard way
 * to prove move generation, including castling, en passant, promotion and pinned
 * pieces. The page itself is then driven through real games.
 */

import { runSuite } from '../../tools/browser-harness.mjs';

const PAGE = '/activities/chess/';
const INFO = `return window.__chess.info;`;
const FEN = `return window.__chess.fen;`;
const click = name => `window.__chess.click(${JSON.stringify(name)}); return 1;`;

// Positions and node counts from the standard perft suite.
const PERFT = [
  ['the opening position', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['Kiwipete (castling, pins)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['an endgame with en passant', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['a promotion tangle', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['an underpromotion position', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]]
];

runSuite('Chess', async (t) => {
  await t.open(PAGE, `return !!window.__chess && !!window.Chess`);

  t.check(await t.eval(`return document.title.includes('Chess')`), 'page title');
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq').length === 64`), 'the board is 8×8');
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq .piece').length === 32`),
    'the opening position has 32 pieces');
  t.check(await t.eval(`return window.__chess.fen.startsWith('rnbqkbnr/pppppppp')`),
    'the game opens from the standard position');

  // ------------------------------------------------- move generation (perft)
  for (const [label, fen, counts] of PERFT) {
    for (let depth = 0; depth < counts.length; depth++) {
      const got = await t.eval(`
        const pos = window.Chess.parseFen(${JSON.stringify(fen)});
        return window.Chess.perft(pos, ${depth + 1});`);
      t.check(got === counts[depth], `perft ${depth + 1} on ${label} is ${counts[depth]}`, `got ${got}`);
    }
  }

  // ------------------------------------------------------------ tap to move
  await t.eval(`document.getElementById('mode').value = 'human';
    document.getElementById('mode').dispatchEvent(new Event('change')); return 1;`);
  await t.eval(click('e2'));
  t.check(await t.eval(`return document.querySelector('[data-square="e2"]').classList.contains('sel')`),
    'tapping a piece selects it');
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq.move').length === 2`),
    'a pawn on its home square offers two moves');
  await t.eval(click('e4'));
  t.check((await t.eval(FEN)).includes(' b '), 'making a move passes the turn');
  t.check((await t.eval(`return window.__chess.san`))[0] === 'e4', 'the move is recorded as e4');
  t.check(await t.eval(`return document.querySelector('[data-square="e4"]').classList.contains('last')`),
    'the last move is highlighted');

  await t.eval(click('e7'));
  await t.eval(click('e5'));
  t.check((await t.eval(`return window.__chess.san`)).join(' ') === 'e4 e5', 'both moves are listed');
  t.check(await t.eval(`return document.querySelectorAll('#moves ol li').length === 1`),
    'the move list pairs White and Black on one numbered line');

  // Illegal destinations are simply not offered.
  await t.eval(click('d1'));
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq.move').length === 4`),
    'the queen sees exactly her four open squares after 1.e4 e5');
  await t.eval(click('d8'));
  t.check(await t.eval(`return !window.__chess.info.selected`),
    'tapping an opponent piece clears the selection instead of moving it');

  // ------------------------------------------------------------- castling
  await t.eval(`window.__chess.setFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1'); return 1;`);
  await t.eval(click('e1'));
  t.check(await t.eval(`
    return ['c1','g1'].every(s => document.querySelector('[data-square="' + s + '"]').classList.contains('move'));`),
    'both castles are offered when the rights and squares allow');
  await t.eval(click('g1'));
  t.check((await t.eval(FEN)).startsWith('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1'),
    'castling short moves the rook as well');
  t.check((await t.eval(`return window.__chess.san`))[0] === 'O-O', 'it is written O-O');

  // A king may not castle out of check.
  await t.eval(`window.__chess.setFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1'); return 1;`);
  await t.eval(click('e1'));
  t.check(await t.eval(`
    return !document.querySelector('[data-square="g1"]').classList.contains('move') &&
           !document.querySelector('[data-square="c1"]').classList.contains('move');`),
    'castling is refused while the king is in check');

  // ------------------------------------------------------------ promotion
  await t.eval(`window.__chess.setFen('8/P6k/8/8/8/8/8/K7 w - - 0 1'); return 1;`);
  await t.eval(click('a7'));
  await t.eval(click('a8'));
  t.check(await t.eval(`return !document.getElementById('promo').hidden`),
    'reaching the last rank asks which piece to promote to');
  t.check(await t.eval(`return document.querySelectorAll('#promo button').length === 4`),
    'all four promotion pieces are offered');
  await t.eval(`[...document.querySelectorAll('#promo button')]
    .find(b => b.getAttribute('aria-label').includes('knight')).click(); return 1;`);
  t.check((await t.eval(FEN)).startsWith('N7/7k'), 'underpromotion to a knight works');
  t.check((await t.eval(`return window.__chess.san`))[0] === 'a8=N', 'it is written a8=N');
  t.check(await t.eval(`return document.getElementById('promo').hidden`),
    'the promotion picker closes again');

  // ----------------------------------------------------------- en passant
  await t.eval(`window.__chess.setFen('rnbqkbnr/pp1ppppp/8/8/4pP2/8/PPPPP1PP/RNBQKBNR b KQkq f3 0 3'); return 1;`);
  await t.eval(click('e4'));
  t.check(await t.eval(`return document.querySelector('[data-square="f3"]').classList.contains('move')`),
    'en passant is offered on the square behind the pawn');
  await t.eval(click('f3'));
  t.check(await t.eval(`
    return !document.querySelector('[data-square="f4"] .piece') &&
           !!document.querySelector('[data-square="f3"] .piece');`),
    'the pawn captured en passant is lifted off its own square');

  // ---------------------------------------------------------- checkmate
  await t.eval(`window.__chess.setFen('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'); return 1;`);
  t.check((await t.eval(INFO)).status === 'checkmate', 'Fool’s mate is recognised as checkmate');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('Black wins'),
    'the result names the winner');
  await t.eval(click('e1'));
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq.move').length === 0`),
    'no moves are offered once the game is over');

  // ---------------------------------------------------------- stalemate
  await t.eval(`window.__chess.setFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); return 1;`);
  t.check((await t.eval(INFO)).status === 'stalemate', 'a stalemate is recognised');
  t.check((await t.eval(`return document.getElementById('msg').textContent`)).includes('draw'),
    'stalemate is reported as a draw');

  // ------------------------------------------------------- dead position
  await t.eval(`window.__chess.setFen('8/8/4k3/8/8/3K4/8/8 w - - 0 1'); return 1;`);
  t.check((await t.eval(INFO)).status === 'material', 'king against king is a dead position');

  // --------------------------------------------------- the computer plays
  await t.eval(`
    document.getElementById('level').value = '1';
    document.getElementById('mode').value = 'cpu-b';
    document.getElementById('mode').dispatchEvent(new Event('change'));
    return 1;`);
  await t.waitFor(() => t.eval(`return !window.__chess.info.thinking`), 'the board to settle');
  await t.eval(click('e2'));
  await t.eval(click('e4'));
  await t.waitFor(() => t.eval(`return window.__chess.san.length === 2`), 'the computer to reply', 20000);
  t.check(await t.eval(`return window.__chess.info.turn === 'w'`), 'the computer replies and hands the turn back');
  t.check(await t.eval(`return window.__chess.san.length === 2`), 'its reply is recorded');
  t.check(await t.eval(`return !window.__chess.info.thinking`), 'it stops thinking when done');

  // It should take a piece that is simply hanging.
  await t.eval(`window.__chess.setFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1'); return 1;`);
  const grabbed = await t.eval(`
    const pos = window.Chess.parseFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1');
    const m = window.Chess.search(pos, 2);
    return window.Chess.nameOf(m.to);`);
  t.check(grabbed === 'd5', 'the search takes a free queen', `played to ${grabbed}`);

  // And it should find mate in one.
  const mate = await t.eval(`
    const pos = window.Chess.parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const m = window.Chess.search(pos, 2);
    return window.Chess.san(pos, m);`);
  t.check(mate === 'Ra8#', 'the search finds mate in one', `played ${mate}`);

  // ---------------------------------------------------------------- undo
  await t.eval(`
    document.getElementById('mode').value = 'human';
    document.getElementById('mode').dispatchEvent(new Event('change'));
    return 1;`);
  await t.eval(click('e2'));
  await t.eval(click('e4'));
  t.check(await t.eval(`return !document.getElementById('undo').disabled`), 'undo lights up after a move');
  await t.eval(`document.getElementById('undo').click(); return 1;`);
  t.check((await t.eval(FEN)).startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'),
    'undo restores the position');
  t.check(await t.eval(`return window.__chess.san.length === 0`), 'undo removes the move from the list');
  t.check(await t.eval(`return document.getElementById('undo').disabled`),
    'undo switches off at the start of the game');

  // ---------------------------------------------------------------- flip
  const topLeft = `return document.querySelectorAll('.ch-sq')[0].dataset.square;`;
  t.check(await t.eval(topLeft) === 'a8', 'White is at the bottom by default');
  await t.eval(`document.getElementById('flip').click(); return 1;`);
  t.check(await t.eval(topLeft) === 'h1', 'Flip board turns it around');
  await t.eval(`document.getElementById('flip').click(); return 1;`);
  t.check(await t.eval(topLeft) === 'a8', 'and flips back');

  // ---------------------------------------------------------------- a11y
  t.check((await t.eval(`return document.querySelector('[data-square="e1"]').getAttribute('aria-label')`))
    === 'e1, white king', 'squares announce their name and occupant');
  t.check((await t.eval(`return document.querySelector('[data-square="e5"]').getAttribute('aria-label')`))
    === 'e5, empty', 'empty squares say so');

  // -------------------------------------------------------------- mobile
  await t.checkMobileLayout('#board');
  await t.phone();
  t.check(await t.eval(`
    const r = document.querySelector('.ch-sq').getBoundingClientRect();
    return r.width >= 34 && r.height >= 34;`),
    'squares stay big enough to tap on a phone');
  await t.eval(click('e2'));
  t.check(await t.eval(`return document.querySelectorAll('.ch-sq.move').length === 2`),
    'pieces still select on a phone');
  await t.desktop();
});
