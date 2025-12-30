import { Injectable } from '@angular/core';
import { Board } from '../interfaces/Board.interface';
import { Piece } from '../interfaces/Piece.interface';
import { CheckMateService } from './check-mate.service';

@Injectable({
  providedIn: 'root',
})
export class KingCastleService {
  constructor(
    private checkMateService: CheckMateService
  ) {}

  canCastle(
    board: Board,
    king: Piece,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ): boolean {
    if (king.hasMoved) return false;

    const isKingSide = to.col > from.col;
    const rookCol = isKingSide ? 7 : 0;
    const rook = board[from.row][rookCol].piece;

    if (!rook || rook.type !== 'rook') return false;
    if (rook.color !== king.color) return false;
    if (rook.hasMoved) return false;

    const step = isKingSide ? 1 : -1;

    // camino libre entre rey y torre
    for (let c = from.col + step; c !== rookCol; c += step) {
      if (board[from.row][c].piece) return false;
    }

    // rey no puede estar en jaque
    if (this.checkMateService.isKingInCheck(board, king.color)) return false;

    // rey no puede pasar por jaque
    const kingPath = isKingSide
      ? [from.col + 1, from.col + 2]
      : [from.col - 1, from.col - 2];

    for (const col of kingPath) {
      const clone = structuredClone(board);
      clone[from.row][from.col].piece = undefined;
      clone[from.row][col].piece = king;

      if (this.checkMateService.isKingInCheck(clone, king.color)) {
        return false;
      }
    }

    return true;
  }
  
}
