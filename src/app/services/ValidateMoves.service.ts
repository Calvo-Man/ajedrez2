import { Injectable } from '@angular/core';
import { Piece } from '../interfaces/Piece.interface';
import { Board } from '../interfaces/Board.interface';
import { KingCastleService } from './king-castle.service';

@Injectable({
  providedIn: 'root',
})
export class ValidateMovesService {
  constructor(private kingCastleService: KingCastleService) {}
  choosePiece(
    piece: Piece,
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    switch (piece.type) {
      case 'pawn':
        return this.validatePawnMove(board, piece, from, to);

      case 'knight':
        return this.validateKnightMove(board, piece, from, to);

      case 'bishop':
        return this.validateBishopMove(board, piece, from, to);

      case 'rook':
        return this.validateRookMove(board, piece, from, to);

      case 'queen':
        return this.validateQueenMove(board, piece, from, to);

      case 'king':
        return this.validateKingMove(board, piece, from, to);

      default:
        return false;
    }
  }
  validatePawnMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const direction = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;

    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;

    const targetPiece = board[to.row][to.col].piece;

    // 🟦 1. Avance normal (1 casilla)
    if (colDiff === 0 && rowDiff === direction) {
      return !targetPiece;
    }

    // 🟦 2. Avance doble desde fila inicial
    if (colDiff === 0 && from.row === startRow && rowDiff === direction * 2) {
      const middleRow = from.row + direction;

      return !board[middleRow][from.col].piece && !targetPiece;
    }

    // 🟥 3. Captura diagonal
    if (Math.abs(colDiff) === 1 && rowDiff === direction) {
      return targetPiece !== undefined && targetPiece.color !== piece.color;
    }

    // ❌ Todo lo demás es ilegal
    return false;
  }

  validateKnightMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // 🐴 Movimiento en L
    const isLMove =
      (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);

    if (!isLMove) return false;

    const targetPiece = board[to.row][to.col].piece;

    // ❌ no puede caer sobre pieza propia
    if (targetPiece && targetPiece.color === piece.color) {
      return false;
    }

    // ✅ captura o movimiento libre
    return true;
  }

  validateRookMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    // ❌ No es movimiento recto
    if (from.row !== to.row && from.col !== to.col) {
      return false;
    }

    const rowDirection = Math.sign(to.row - from.row);
    const colDirection = Math.sign(to.col - from.col);

    let currentRow = from.row + rowDirection;
    let currentCol = from.col + colDirection;

    // 🔍 Revisar camino
    while (currentRow !== to.row || currentCol !== to.col) {
      if (board[currentRow][currentCol].piece) {
        return false; // bloqueado
      }

      currentRow += rowDirection;
      currentCol += colDirection;
    }

    const targetPiece = board[to.row][to.col].piece;

    // ❌ no puede capturar pieza propia
    if (targetPiece && targetPiece.color === piece.color) {
      return false;
    }

    return true;
  }

  validateBishopMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;

    // 1️⃣ Debe ser diagonal
    if (Math.abs(rowDiff) !== Math.abs(colDiff)) {
      return false;
    }

    const rowStep = Math.sign(rowDiff);
    const colStep = Math.sign(colDiff);

    // 2️⃣ Camino libre
    let r = from.row + rowStep;
    let c = from.col + colStep;

    while (r !== to.row && c !== to.col) {
      if (board[r][c].piece) return false;
      r += rowStep;
      c += colStep;
    }

    // 3️⃣ Destino
    const targetPiece = board[to.row][to.col].piece;
    return !targetPiece || targetPiece.color !== piece.color;
  }
  validateQueenMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const rowDiff = to.row - from.row;
    const colDiff = to.col - from.col;

    // 1️⃣ Torre o alfil
    if (
      rowDiff !== 0 &&
      colDiff !== 0 &&
      Math.abs(rowDiff) !== Math.abs(colDiff)
    ) {
      return false;
    }

    const rowStep = Math.sign(rowDiff);
    const colStep = Math.sign(colDiff);

    let currentRow = from.row + rowStep;
    let currentCol = from.col + colStep;

    // 2️⃣ Camino libre
    while (currentRow !== to.row || currentCol !== to.col) {
      if (board[currentRow][currentCol].piece) {
        return false;
      }
      currentRow += rowStep;
      currentCol += colStep;
    }

    // 3️⃣ Destino
    const targetPiece = board[to.row][to.col].piece;
    return !targetPiece || targetPiece.color !== piece.color;
  }
  validateKingMove(
    board: Board,
    piece: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const rowDiff = Math.abs(to.row - from.row);
    const colDiff = Math.abs(to.col - from.col);

    // ♜ ENROQUE (2 columnas, misma fila)
    if (rowDiff === 0 && colDiff === 2) {
      return this.kingCastleService.canCastle(board, piece, from, to);
    }

    // ♚ movimiento normal: 1 casilla
    if (rowDiff > 1 || colDiff > 1) return false;
    if (rowDiff === 0 && colDiff === 0) return false;

    // ❌ no capturar pieza propia
    const targetPiece = board[to.row][to.col].piece;
    if (targetPiece && targetPiece.color === piece.color) return false;

    return true;
  }
}
