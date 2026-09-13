/**
 * Chess pieces as inline SVG.
 *
 * The Unicode chess characters cannot be used for this: U+265F, the pawn, is the
 * one of the six with emoji presentation, so a colour-emoji font paints it black
 * whatever CSS `color` says — White's pawns came out black on macOS while the
 * other five pieces obeyed the stylesheet. Drawing the pieces removes the font
 * from the picture: the colours are fill values, and they stay crisp at any size.
 *
 * Shapes are drawn on a 45×45 board square, ground line at y=39.
 */
(function (global) {
  'use strict';

  // The plinth every piece stands on, so the set reads as one family.
  const PLINTH =
    '<path d="M13.4 29.6h18.2c.6 2.1 1.6 3.6 2.8 4.8H10.6c1.2-1.2 2.2-2.7 2.8-4.8Z"/><rect x="10" y="34.6" width="25" height="4.3" rx="1.5"/>';

  const SHAPES = {
    P: // pawn
      '<path d="M22.5 6.7C19.8 6.7 17.7 8.8 17.7 11.5C17.7 13 18.4 14.3 19.5 15.2C17.2 16.5 15.6 18.7 15.2 21.4L29.8 21.4C29.4 18.7 27.8 16.5 25.5 15.2C26.6 14.3 27.3 13 27.3 11.5C27.3 8.8 25.2 6.7 22.5 6.7Z"/><path d="M16.4 22.8c.4 3.3 1.4 5.4 2.4 6.8h7.4c1-1.4 2-3.5 2.4-6.8Z"/>' + PLINTH,
    R: // rook
      '<path d="M11 9h5v3h4V9h5v3h4V9h5v6.6H11Z"/><path d="M13.8 16.8h17.4l-1.1 12.8H14.9Z"/>' + PLINTH,
    B: // bishop
      '<circle cx="22.5" cy="7.6" r="2.3"/><path d="M22.5 10.6c3.3 2.9 6.1 6.3 6.1 10.1 0 3.6-2.7 6-6.1 6s-6.1-2.4-6.1-6c0-3.8 2.8-7.2 6.1-10.1Z"/><path d="M20.1 15.4 24.9 20.4" class="ch-line"/><path d="M16.2 26.6h12.6c-.2 1.3-.8 2.2-1.6 3H17.8c-.8-.8-1.4-1.7-1.6-3Z"/>' + PLINTH,
    N: // knight
      '<path d="M31.6 29.6C32.6 23.4 32.4 19 30.6 15 29 11.2 25.8 8.8 21.8 7.9L21 4.6 18.8 7.5C16.8 8.7 15.2 10.4 14.4 12.4L12.4 11.4 12 14.8 15 16.6C15.4 18.8 16.6 20.6 18.4 21.8 15.6 24.4 14 26.8 13.6 29.6Z"/><circle cx="25" cy="14.6" r="1.4" class="ch-cut"/><path d="M16.6 13.2 19.4 11.6" class="ch-line"/>' + PLINTH,
    Q: // queen
      '<circle cx="10.6" cy="14" r="2.4"/><circle cx="16.6" cy="9.4" r="2.2"/><circle cx="22.5" cy="7.4" r="2.6"/><circle cx="28.4" cy="9.4" r="2.2"/><circle cx="34.4" cy="14" r="2.4"/><path d="M11 16.4 14.4 29.6h16.2L34 16.4 28.8 22.2 25 11.6 22.5 21.4 20 11.6 16.2 22.2Z"/>' + PLINTH,
    K: // king
      '<path d="M21.2 3.4h2.6v3.4h3.4v2.6h-3.4v3.4h-2.6V9.4h-3.4V6.8h3.4Z"/><path d="M22.5 13c-3.9 0-7.1 2.4-8.3 5.8-1 2.8-.2 5.8 1.4 8.2.6.9 1 1.6 1.3 2.6h11.2c.3-1 .7-1.7 1.3-2.6 1.6-2.4 2.4-5.4 1.4-8.2C29.6 15.4 26.4 13 22.5 13Z"/>' + PLINTH
  };

  /**
   * Build an <svg> for one piece letter ('P' white, 'p' black).
   * `title` becomes an accessible name when the caller wants one; the board
   * labels its own squares, so it normally passes nothing.
   */
  function pieceSvg(piece, title) {
    const type = piece.toUpperCase();
    const white = piece === type;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 45 45');
    svg.setAttribute('class', 'ch-piece ' + (white ? 'ch-white' : 'ch-black'));
    if (title) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', title);
    } else {
      svg.setAttribute('aria-hidden', 'true');
    }
    svg.innerHTML = SHAPES[type];
    return svg;
  }

  global.ChessPieces = { pieceSvg, SHAPES };
})(window);
