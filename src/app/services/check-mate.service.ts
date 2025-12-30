import { Injectable } from '@angular/core';
import { Board } from '../interfaces/Board.interface';

@Injectable({
  providedIn: 'root',
})
export class CheckMateService {
  constructor() {}
  findKing(
    board: Board,
    color: 'white' | 'black'
  ): { row: number; col: number } | null {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col].piece;
        if (piece && piece.type === 'king' && piece.color === color) {
          return { row, col };
        }
      }
    }
    return null;
  }

  isKingInCheck(board: Board, kingColor: 'white' | 'black'): boolean {
    const kingPos = this.findKing(board, kingColor);
    if (!kingPos) return false;

    const enemyColor = kingColor === 'white' ? 'black' : 'white';

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col].piece;

        if (piece && piece.color === enemyColor) {
          const from = { row, col };
          const to = kingPos;

          const canAttackKing = this.canPieceAttackSquare(
            piece,
            board,
            from,
            to
          );

          if (canAttackKing) {
            return true; // 🚨 JAQUE
          }
        }
      }
    }

    return false;
  }
  cloneBoard(board: Board): Board {
    return board.map((row) =>
      row.map((cell) => ({
        ...cell,
        piece: cell.piece ? { ...cell.piece } : undefined,
      }))
    );
  }
  simulateMove(
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): Board {
    const newBoard = this.cloneBoard(board);

    newBoard[to.row][to.col].piece = newBoard[from.row][from.col].piece;

    newBoard[from.row][from.col].piece = undefined;

    return newBoard;
  }

  isMoveSafe(
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number },
    pieceColor: 'white' | 'black'
  ): boolean {
    const simulatedBoard = this.simulateMove(board, from, to);

    return !this.isKingInCheck(simulatedBoard, pieceColor);
  }
  canPieceAttackSquare(
    piece: any,
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    switch (piece.type) {
      case 'pawn': {
        const dir = piece.color === 'white' ? -1 : 1;
        return to.row === from.row + dir && Math.abs(to.col - from.col) === 1;
      }

      case 'knight': {
        const r = Math.abs(to.row - from.row);
        const c = Math.abs(to.col - from.col);
        return (r === 2 && c === 1) || (r === 1 && c === 2);
      }

      case 'bishop':
        return this.attacksDiagonal(board, from, to);

      case 'rook':
        return this.attacksStraight(board, from, to);

      case 'queen':
        return (
          this.attacksDiagonal(board, from, to) ||
          this.attacksStraight(board, from, to)
        );

      case 'king': {
        return (
          Math.abs(to.row - from.row) <= 1 && Math.abs(to.col - from.col) <= 1
        );
      }

      default:
        return false;
    }
  }

  attacksStraight(
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    if (from.row !== to.row && from.col !== to.col) return false;

    const rStep = Math.sign(to.row - from.row);
    const cStep = Math.sign(to.col - from.col);

    let r = from.row + rStep;
    let c = from.col + cStep;

    while (r !== to.row || c !== to.col) {
      if (board[r][c].piece) return false;
      r += rStep;
      c += cStep;
    }

    return true;
  }

  attacksDiagonal(
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    const rDiff = to.row - from.row;
    const cDiff = to.col - from.col;

    if (Math.abs(rDiff) !== Math.abs(cDiff)) return false;

    const rStep = Math.sign(rDiff);
    const cStep = Math.sign(cDiff);

    let r = from.row + rStep;
    let c = from.col + cStep;

    while (r !== to.row || c !== to.col) {
      if (board[r][c].piece) return false;
      r += rStep;
      c += cStep;
    }

    return true;
  }
}
