/**
 * A complete chess rules engine plus a small search, with no dependencies.
 *
 * Board indexing runs 0..63 from a8 to h1, so index 0 is the top-left square as
 * drawn. Pieces are single letters, uppercase for White and lowercase for Black.
 * Positions are plain objects and every move returns a new one, which keeps the
 * search simple at the cost of a 64-element copy per node.
 *
 * The public surface is window.Chess: parseFen, legalMoves, makeMove, status,
 * san, perft and search.
 */
(function (global) {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  const isWhite = p => p >= 'A' && p <= 'Z';
  const colorOf = p => (p === '.' ? null : (isWhite(p) ? 'w' : 'b'));
  const other = c => (c === 'w' ? 'b' : 'w');

  const rowOf = i => i >> 3;
  const colOf = i => i & 7;
  const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const sq = (r, c) => r * 8 + c;

  function nameOf(i) { return FILES[colOf(i)] + (8 - rowOf(i)); }
  function indexOf(name) { return sq(8 - Number(name[1]), FILES.indexOf(name[0])); }

  // --------------------------------------------------------------- position

  function parseFen(fen) {
    const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
    const board = new Array(64).fill('.');
    let i = 0;
    for (const ch of placement) {
      if (ch === '/') continue;
      if (ch >= '1' && ch <= '8') { i += Number(ch); continue; }
      board[i++] = ch;
    }
    return {
      board,
      turn: turn === 'b' ? 'b' : 'w',
      castling: {
        wk: castling.includes('K'), wq: castling.includes('Q'),
        bk: castling.includes('k'), bq: castling.includes('q')
      },
      ep: ep && ep !== '-' ? indexOf(ep) : null,
      half: Number(half || 0),
      full: Number(full || 1)
    };
  }

  function toFen(pos) {
    let placement = '';
    for (let r = 0; r < 8; r++) {
      let run = 0;
      for (let c = 0; c < 8; c++) {
        const p = pos.board[sq(r, c)];
        if (p === '.') { run++; continue; }
        if (run) { placement += run; run = 0; }
        placement += p;
      }
      if (run) placement += run;
      if (r < 7) placement += '/';
    }
    const cast = (pos.castling.wk ? 'K' : '') + (pos.castling.wq ? 'Q' : '') +
      (pos.castling.bk ? 'k' : '') + (pos.castling.bq ? 'q' : '');
    return `${placement} ${pos.turn} ${cast || '-'} ${pos.ep == null ? '-' : nameOf(pos.ep)} ${pos.half} ${pos.full}`;
  }

  function clone(pos) {
    return {
      board: pos.board.slice(),
      turn: pos.turn,
      castling: { ...pos.castling },
      ep: pos.ep,
      half: pos.half,
      full: pos.full
    };
  }

  // ------------------------------------------------------- move generation

  const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const KING   = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const ROOK   = [[-1,0],[1,0],[0,-1],[0,1]];
  const BISHOP = [[-1,-1],[-1,1],[1,-1],[1,1]];

  function findKing(pos, color) {
    const k = color === 'w' ? 'K' : 'k';
    return pos.board.indexOf(k);
  }

  /** Is `target` attacked by any piece of `by`? Used for check and castling. */
  function attacked(pos, target, by) {
    const b = pos.board;
    const tr = rowOf(target), tc = colOf(target);

    // Pawns attack diagonally forward, which is upward on the board for White.
    const dir = by === 'w' ? 1 : -1;      // from target back toward the attacker
    for (const dc of [-1, 1]) {
      const r = tr + dir, c = tc + dc;
      if (!onBoard(r, c)) continue;
      const p = b[sq(r, c)];
      if (p === (by === 'w' ? 'P' : 'p')) return true;
    }

    for (const [dr, dc] of KNIGHT) {
      const r = tr + dr, c = tc + dc;
      if (!onBoard(r, c)) continue;
      const p = b[sq(r, c)];
      if (p === (by === 'w' ? 'N' : 'n')) return true;
    }

    for (const [dr, dc] of KING) {
      const r = tr + dr, c = tc + dc;
      if (!onBoard(r, c)) continue;
      const p = b[sq(r, c)];
      if (p === (by === 'w' ? 'K' : 'k')) return true;
    }

    const sliders = [
      [ROOK, by === 'w' ? ['R', 'Q'] : ['r', 'q']],
      [BISHOP, by === 'w' ? ['B', 'Q'] : ['b', 'q']]
    ];
    for (const [dirs, pieces] of sliders) {
      for (const [dr, dc] of dirs) {
        let r = tr + dr, c = tc + dc;
        while (onBoard(r, c)) {
          const p = b[sq(r, c)];
          if (p !== '.') {
            if (pieces.includes(p)) return true;
            break;
          }
          r += dr; c += dc;
        }
      }
    }
    return false;
  }

  function inCheck(pos, color) {
    const k = findKing(pos, color);
    return k >= 0 && attacked(pos, k, other(color));
  }

  function pushPawnMoves(pos, from, out) {
    const b = pos.board;
    const me = pos.turn;
    const dir = me === 'w' ? -1 : 1;           // White moves toward row 0
    const startRow = me === 'w' ? 6 : 1;
    const lastRow = me === 'w' ? 0 : 7;
    const r = rowOf(from), c = colOf(from);
    const promos = me === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];

    const one = sq(r + dir, c);
    if (onBoard(r + dir, c) && b[one] === '.') {
      if (r + dir === lastRow) promos.forEach(promo => out.push({ from, to: one, promo }));
      else {
        out.push({ from, to: one });
        const two = sq(r + 2 * dir, c);
        if (r === startRow && b[two] === '.') out.push({ from, to: two, double: true });
      }
    }

    for (const dc of [-1, 1]) {
      const rr = r + dir, cc = c + dc;
      if (!onBoard(rr, cc)) continue;
      const to = sq(rr, cc);
      const victim = b[to];
      if (victim !== '.' && colorOf(victim) !== me) {
        if (rr === lastRow) promos.forEach(promo => out.push({ from, to, promo }));
        else out.push({ from, to });
      } else if (to === pos.ep && victim === '.') {
        out.push({ from, to, ep: true });
      }
    }
  }

  function pushCastles(pos, out) {
    const me = pos.turn;
    const b = pos.board;
    const row = me === 'w' ? 7 : 0;
    const king = sq(row, 4);
    if (b[king] !== (me === 'w' ? 'K' : 'k')) return;
    if (inCheck(pos, me)) return;

    const rights = me === 'w'
      ? { short: pos.castling.wk, long: pos.castling.wq, rook: 'R' }
      : { short: pos.castling.bk, long: pos.castling.bq, rook: 'r' };

    // Short: f and g empty, e/f/g unattacked, rook on h.
    if (rights.short && b[sq(row, 5)] === '.' && b[sq(row, 6)] === '.' &&
        b[sq(row, 7)] === rights.rook &&
        !attacked(pos, sq(row, 5), other(me)) && !attacked(pos, sq(row, 6), other(me))) {
      out.push({ from: king, to: sq(row, 6), castle: 'k' });
    }
    // Long: b, c and d empty, e/d/c unattacked, rook on a.
    if (rights.long && b[sq(row, 1)] === '.' && b[sq(row, 2)] === '.' && b[sq(row, 3)] === '.' &&
        b[sq(row, 0)] === rights.rook &&
        !attacked(pos, sq(row, 3), other(me)) && !attacked(pos, sq(row, 2), other(me))) {
      out.push({ from: king, to: sq(row, 2), castle: 'q' });
    }
  }

  function pseudoMoves(pos) {
    const out = [];
    const b = pos.board;
    const me = pos.turn;

    for (let from = 0; from < 64; from++) {
      const p = b[from];
      if (p === '.' || colorOf(p) !== me) continue;
      const type = p.toUpperCase();
      const r = rowOf(from), c = colOf(from);

      if (type === 'P') { pushPawnMoves(pos, from, out); continue; }

      if (type === 'N' || type === 'K') {
        for (const [dr, dc] of (type === 'N' ? KNIGHT : KING)) {
          const rr = r + dr, cc = c + dc;
          if (!onBoard(rr, cc)) continue;
          const to = sq(rr, cc);
          if (b[to] !== '.' && colorOf(b[to]) === me) continue;
          out.push({ from, to });
        }
        continue;
      }

      const dirs = type === 'R' ? ROOK : type === 'B' ? BISHOP : ROOK.concat(BISHOP);
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
          const to = sq(rr, cc);
          const victim = b[to];
          if (victim === '.') { out.push({ from, to }); }
          else {
            if (colorOf(victim) !== me) out.push({ from, to });
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }

    pushCastles(pos, out);
    return out;
  }

  function makeMove(pos, move) {
    const next = clone(pos);
    const b = next.board;
    const me = pos.turn;
    const piece = b[move.from];
    const type = piece.toUpperCase();
    const captured = move.ep ? (me === 'w' ? 'p' : 'P') : b[move.to];

    b[move.to] = move.promo || piece;
    b[move.from] = '.';

    if (move.ep) {
      // The captured pawn sits beside the destination, not on it.
      b[sq(rowOf(move.from), colOf(move.to))] = '.';
    }
    if (move.castle === 'k') {
      const row = rowOf(move.from);
      b[sq(row, 5)] = b[sq(row, 7)];
      b[sq(row, 7)] = '.';
    }
    if (move.castle === 'q') {
      const row = rowOf(move.from);
      b[sq(row, 3)] = b[sq(row, 0)];
      b[sq(row, 0)] = '.';
    }

    // Castling rights fall away when a king or rook leaves, or a rook is taken.
    if (type === 'K') {
      if (me === 'w') { next.castling.wk = next.castling.wq = false; }
      else { next.castling.bk = next.castling.bq = false; }
    }
    const clear = i => {
      if (i === 63) next.castling.wk = false;
      if (i === 56) next.castling.wq = false;
      if (i === 7) next.castling.bk = false;
      if (i === 0) next.castling.bq = false;
    };
    clear(move.from); clear(move.to);

    next.ep = move.double ? sq((rowOf(move.from) + rowOf(move.to)) / 2, colOf(move.from)) : null;
    next.half = (type === 'P' || captured !== '.') ? 0 : pos.half + 1;
    next.full = me === 'b' ? pos.full + 1 : pos.full;
    next.turn = other(me);
    next.captured = captured === '.' ? null : captured;
    return next;
  }

  function legalMoves(pos) {
    const out = [];
    for (const move of pseudoMoves(pos)) {
      const next = makeMove(pos, move);
      if (!inCheck(next, pos.turn)) out.push(move);
    }
    return out;
  }

  // ------------------------------------------------------------- outcomes

  function insufficientMaterial(pos) {
    const pieces = pos.board.filter(p => p !== '.');
    if (pieces.length > 4) return false;
    const minors = pieces.filter(p => 'BNbn'.includes(p));
    const heavy = pieces.filter(p => 'PRQprq'.includes(p));
    if (heavy.length) return false;
    return minors.length <= 1 ||
      // K+B vs K+B with both bishops on the same colour is also dead.
      (minors.length === 2 && minors.every(p => p.toUpperCase() === 'B') &&
        sameColorBishops(pos));
  }

  function sameColorBishops(pos) {
    const squares = [];
    pos.board.forEach((p, i) => { if (p.toUpperCase() === 'B') squares.push(i); });
    if (squares.length !== 2) return false;
    const shade = i => (rowOf(i) + colOf(i)) % 2;
    return shade(squares[0]) === shade(squares[1]);
  }

  /** 'checkmate' | 'stalemate' | 'fifty' | 'material' | 'check' | 'ok' */
  function status(pos) {
    const moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos, pos.turn) ? 'checkmate' : 'stalemate';
    if (pos.half >= 100) return 'fifty';
    if (insufficientMaterial(pos)) return 'material';
    return inCheck(pos, pos.turn) ? 'check' : 'ok';
  }

  // ------------------------------------------------------------ notation

  function san(pos, move) {
    const piece = pos.board[move.from];
    const type = piece.toUpperCase();
    const next = makeMove(pos, move);
    const suffix = (() => {
      const st = status(next);
      if (st === 'checkmate') return '#';
      if (st === 'check') return '+';
      return '';
    })();

    if (move.castle === 'k') return 'O-O' + suffix;
    if (move.castle === 'q') return 'O-O-O' + suffix;

    const captures = move.ep || pos.board[move.to] !== '.';
    if (type === 'P') {
      const body = captures ? `${FILES[colOf(move.from)]}x${nameOf(move.to)}` : nameOf(move.to);
      return body + (move.promo ? '=' + move.promo.toUpperCase() : '') + suffix;
    }

    // Disambiguate against any other same-type piece that could also go there.
    const rivals = legalMoves(pos).filter(m =>
      m.to === move.to && m.from !== move.from &&
      pos.board[m.from] === piece);
    let hint = '';
    if (rivals.length) {
      const sameFile = rivals.some(m => colOf(m.from) === colOf(move.from));
      const sameRank = rivals.some(m => rowOf(m.from) === rowOf(move.from));
      if (!sameFile) hint = FILES[colOf(move.from)];
      else if (!sameRank) hint = String(8 - rowOf(move.from));
      else hint = nameOf(move.from);
    }
    return type + hint + (captures ? 'x' : '') + nameOf(move.to) + suffix;
  }

  // ------------------------------------------------------------- perft

  function perft(pos, depth) {
    if (depth === 0) return 1;
    const moves = legalMoves(pos);
    if (depth === 1) return moves.length;
    let total = 0;
    for (const m of moves) total += perft(makeMove(pos, m), depth - 1);
    return total;
  }

  // ------------------------------------------------------------- search

  const VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  // Piece-square tables, from White's point of view, a8 first.
  const PST = {
    P: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10,
        5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5,
        5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40,
        -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
        -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
        -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
        -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    R: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    Q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10,
        -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
        0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
        -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,20,20,20, 20,30,10,0,0,10,30,20]
  };

  const mirror = i => sq(7 - rowOf(i), colOf(i));

  /** Score from the side-to-move's point of view. */
  function evaluate(pos) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = pos.board[i];
      if (p === '.') continue;
      const type = p.toUpperCase();
      const table = PST[type];
      const v = VALUE[type] + (isWhite(p) ? table[i] : table[mirror(i)]);
      score += isWhite(p) ? v : -v;
    }
    return pos.turn === 'w' ? score : -score;
  }

  function orderMoves(pos, moves) {
    // Captures first, best victim first — a cheap stand-in for a real ordering.
    return moves
      .map(m => {
        const victim = pos.board[m.to];
        const gain = victim === '.' ? 0 : VALUE[victim.toUpperCase()];
        const attacker = VALUE[pos.board[m.from].toUpperCase()];
        return { m, key: (gain ? 10000 + gain - attacker / 100 : 0) + (m.promo ? 900 : 0) };
      })
      .sort((a, b) => b.key - a.key)
      .map(x => x.m);
  }

  const MATE = 100000;

  function negamax(pos, depth, alpha, beta, ply) {
    const moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos, pos.turn) ? -MATE + ply : 0;
    if (depth === 0) return evaluate(pos);

    let best = -Infinity;
    for (const m of orderMoves(pos, moves)) {
      const score = -negamax(makeMove(pos, m), depth - 1, -beta, -alpha, ply + 1);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /**
   * Pick a move. `level` is the search depth; a little randomness among equal
   * moves at the shallow levels keeps the opening from being identical twice.
   */
  function search(pos, level = 2) {
    const moves = orderMoves(pos, legalMoves(pos));
    if (!moves.length) return null;

    let best = -Infinity;
    let bucket = [];
    for (const m of moves) {
      const score = -negamax(makeMove(pos, m), level - 1, -Infinity, Infinity, 1);
      if (score > best + 0.001) { best = score; bucket = [m]; }
      else if (Math.abs(score - best) <= 0.001) bucket.push(m);
    }
    return bucket[Math.floor(Math.random() * bucket.length)];
  }

  global.Chess = {
    START_FEN, FILES,
    parseFen, toFen, clone,
    nameOf, indexOf, rowOf, colOf, sq, colorOf, other,
    legalMoves, pseudoMoves, makeMove, inCheck, attacked, status, san,
    insufficientMaterial, perft, evaluate, search
  };
})(window);
