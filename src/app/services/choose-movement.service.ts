import { Injectable } from '@angular/core';
import { CheckMateService } from './check-mate.service';
import { ValidateMovesService } from './ValidateMoves.service';
import { Board } from '../interfaces/Board.interface';
import { AiMoveContext } from '../interfaces/AiMoveContext';

@Injectable({
  providedIn: 'root',
})
export class ChooseMovementService {
  constructor(
    private validateMovesService: ValidateMovesService,
    private checkMateService: CheckMateService
  ) {}

  pieceValues: Record<string, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 100,
  };

  generateLegalMovesWithScore(board: Board, color: 'white' | 'black') {
    const moves: {
      from: { row: number; col: number };
      to: { row: number; col: number };
      piece: string;
      score: number;
    }[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c].piece;
        if (!piece || piece.color !== color) continue;

        for (let tr = 0; tr < 8; tr++) {
          for (let tc = 0; tc < 8; tc++) {
            const from = { row: r, col: c };
            const to = { row: tr, col: tc };

            // reglas básicas
            if (!this.validateMovesService.choosePiece(piece, board, from, to))
              continue;

            // no dejar rey en jaque
            if (!this.checkMateService.isMoveSafe(board, from, to, color))
              continue;

            const target = board[to.row][to.col].piece;

            // score por captura
            const captureScore = target ? this.pieceValues[target.type] : 0;

            moves.push({
              from,
              to,
              piece: piece.type,
              score: captureScore,
            });
          }
        }
      }
    }

    return moves;
  }

  generateLegalMovesWithContext(board: Board, color: 'white' | 'black') {
    const moves: AiMoveContext[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c].piece;
        if (!piece || piece.color !== color) continue;

        for (let tr = 0; tr < 8; tr++) {
          for (let tc = 0; tc < 8; tc++) {
            const from = { row: r, col: c };
            const to = { row: tr, col: tc };

            if (!this.validateMovesService.choosePiece(piece, board, from, to))
              continue;

            if (!this.checkMateService.isMoveSafe(board, from, to, color))
              continue;

            const target = board[to.row][to.col].piece;
            const simulated = this.simulateMove(board, from, to);

            const isHanging = this.isHangingPiece(simulated, to, color);

            const attackers = this.countAttackers(simulated, to, color);

            const givesCheck = this.checkMateService.isKingInCheck(
              simulated,
              color === 'white' ? 'black' : 'white'
            );
            moves.push({
              from,
              to,
              piece: piece.type,
              isCapture: !!target,
              captures: target?.type,
              isHangingAfterMove: isHanging,
              attackersAfterMove: attackers,
              givesCheck,
            });
          }
        }
      }
    }

    return moves;
  }
  countAttackers(
    board: Board,
    square: { row: number; col: number },
    color: 'white' | 'black'
  ): number {
    let count = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const enemy = board[r][c].piece;
        if (!enemy || enemy.color === color) continue;

        if (
          this.validateMovesService.choosePiece(
            enemy,
            board,
            { row: r, col: c },
            square
          )
        ) {
          count++;
        }
      }
    }

    return count;
  }

  isHangingPiece(
    boardAfterMove: Board,
    to: { row: number; col: number },
    color: 'white' | 'black'
  ): boolean {
    const movedPiece = boardAfterMove[to.row][to.col].piece;
    if (!movedPiece) return false;

    const enemyColor = color === 'white' ? 'black' : 'white';

    // piezas que pueden capturar
    const attackers = this.getAttackerValues(boardAfterMove, to, enemyColor);
    if (attackers.length === 0) return false;

    // piezas que defienden
    const defenders = this.getAttackerValues(boardAfterMove, to, color);

    attackers.sort((a, b) => a - b);
    defenders.sort((a, b) => a - b);

    let material = this.getPieceValue(movedPiece.type);

    let i = 0;
    while (i < attackers.length) {
      // rival captura
      material -= attackers[i];

      // yo recapturo si puedo
      if (i < defenders.length) {
        material += defenders[i];
      }

      // si ya voy perdiendo material → colgada
      if (material < 0) {
        return true;
      }

      i++;
    }

    return false;
  }
  getAttackerValues(
    board: Board,
    square: { row: number; col: number },
    color: 'white' | 'black'
  ): number[] {
    const values: number[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c].piece;
        if (!p || p.color !== color) continue;

        if (
          this.validateMovesService.choosePiece(
            p,
            board,
            { row: r, col: c },
            square
          )
        ) {
          values.push(this.getPieceValue(p.type));
        }
      }
    }

    return values;
  }

  getPieceValue(type: string): number {
    return this.pieceValues[type] ?? 0;
  }

  countDefenders(
    board: Board,
    square: { row: number; col: number },
    color: 'white' | 'black'
  ): number {
    let count = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c].piece;
        if (!p || p.color !== color) continue;

        if (
          this.validateMovesService.choosePiece(
            p,
            board,
            { row: r, col: c },
            square
          )
        ) {
          count++;
        }
      }
    }

    return count;
  }

  simulateMove(
    board: Board,
    from: { row: number; col: number },
    to: { row: number; col: number }
  ) {
    const clone = structuredClone(board);

    clone[to.row][to.col].piece = clone[from.row][from.col].piece;
    clone[from.row][from.col].piece = undefined;
    return clone;
  }
  evaluateBoardSimple(board: Board, color: 'white' | 'black'): number {
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c].piece;
        if (!p) continue;

        const value = this.pieceValues[p.type];
        score += p.color === color ? value : -value;
      }
    }

    return score;
  }
  selectCandidates(moves: AiMoveContext[]): AiMoveContext[] {
    // 1️⃣ jaques: prioridad absoluta
    const checks = moves.filter((m) => m.givesCheck);
    if (checks.length > 0) {
      return checks.slice(0, 10);
    }

    // 2️⃣ capturas seguras
    const safeCaptures = moves.filter(
      (m) => m.isCapture && !m.isHangingAfterMove
    );

    // 3️⃣ movimientos seguros (no colgar pieza)
    const safeMoves = moves.filter(
      (m) => !m.isHangingAfterMove && !m.isCapture
    );

    // 4️⃣ unir sin duplicados
    const combined: AiMoveContext[] = [];

    for (const m of safeCaptures) {
      if (combined.length >= 10) break;
      combined.push(m);
    }

    for (const m of safeMoves) {
      if (combined.length >= 10) break;
      combined.push(m);
    }

    // 5️⃣ fallback (por si hay menos de 10 seguros)
    if (combined.length < 10) {
      for (const m of moves) {
        if (combined.length >= 10) break;
        if (!combined.includes(m)) {
          combined.push(m);
        }
      }
    }

    return combined;
  }
  staticExchangeEvaluation(
    board: Board,
    square: { row: number; col: number },
    defenderColor: 'white' | 'black'
  ): number {
    const attackers: number[] = [];
    const defenders: number[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c].piece;
        if (!piece) continue;

        if (
          this.validateMovesService.choosePiece(
            piece,
            board,
            { row: r, col: c },
            square
          )
        ) {
          const value = this.pieceValues[piece.type];

          if (piece.color === defenderColor) {
            defenders.push(value);
          } else {
            attackers.push(value);
          }
        }
      }
    }

    attackers.sort((a, b) => a - b);
    defenders.sort((a, b) => a - b);

    let gain = 0;
    let turn = 'attacker';

    while (attackers.length || defenders.length) {
      if (turn === 'attacker') {
        if (!attackers.length) break;
        gain -= attackers.shift()!;
        turn = 'defender';
      } else {
        if (!defenders.length) break;
        gain += defenders.shift()!;
        turn = 'attacker';
      }
    }

    return gain;
  }
}
