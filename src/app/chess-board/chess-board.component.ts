import { DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Piece } from '../interfaces/Piece.interface';

import { MovementService } from '../services/movement.service';
import { Board } from '../interfaces/Board.interface';
import { AiService } from '../services/ai.service';
import { ValidateMovesService } from '../services/ValidateMoves.service';
import { CheckMateService } from '../services/check-mate.service';
import { ChooseMovementService } from '../services/choose-movement.service';
import { AiMoveContext } from '../interfaces/AiMoveContext';

@Component({
  selector: 'app-chess-board',
  templateUrl: './chess-board.component.html',
  styleUrls: ['./chess-board.component.css'],
  imports: [CommonModule, DragDropModule],
  standalone: true,
})
export class ChessBoardComponent {
  humanColor: 'white' | 'black' = 'white';
  aiColor: 'white' | 'black' = 'black';
  currentTurn: 'white' | 'black' = 'white';

  board: Board = [];
  validMoves: { row: number; col: number }[] = [];
  capturedWhite: Piece[] = [];
  capturedBlack: Piece[] = [];
  lastMove: {
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null = null;
  movingPiece: {
    from: { row: number; col: number };
    to: { row: number; col: number };
  } | null = null;
  scoreWhite = 0;
  scoreBlack = 0;

  pieceValues: Record<string, number> = {
    peon: 1,
    caballo: 3,
    alfil: 3,
    torre: 5,
    reina: 9,
    rey: 0,
  };
  aiThoughtHistory: string[] = [];

  constructor(
    private movementService: MovementService,
    private aiService: AiService,
    private validateMovesService: ValidateMovesService,
    private checkMateService: CheckMateService,
    private chooseMovementService: ChooseMovementService
  ) {
    this.createBoard();
    this.placePieces();
  }

  createBoard() {
    for (let row = 0; row < 8; row++) {
      const currentRow = [];
      for (let col = 0; col < 8; col++) {
        currentRow.push({
          color: (row + col) % 2,
        });
      }
      this.board.push(currentRow);
    }
  }

  placePieces() {
    // Peones
    for (let i = 0; i < 8; i++) {
      this.board[1][i].piece = {
        type: 'pawn',
        color: 'black',
        hasMoved: false,
      };
      this.board[6][i].piece = {
        type: 'pawn',
        color: 'white',
        hasMoved: false,
      };
    }

    const backRow = [
      'rook',
      'knight',
      'bishop',
      'queen',
      'king',
      'bishop',
      'knight',
      'rook',
    ];

    backRow.forEach((type, i) => {
      this.board[0][i].piece = { type, color: 'black', hasMoved: false };
      this.board[7][i].piece = { type, color: 'white', hasMoved: false };
    });
    console.log(this.board);
  }

  getPieceSymbol(piece: Piece): string {
    const symbols: any = {
      white: {
        king: '♔',
        queen: '♕',
        rook: '♖',
        bishop: '♗',
        knight: '♘',
        pawn: '♙',
      },
      black: {
        king: '♚',
        queen: '♛',
        rook: '♜',
        bishop: '♝',
        knight: '♞',
        pawn: '♟',
      },
    };

    return symbols[piece.color][piece.type];
  }

  dropPiece(event: any) {
    if (!this.dragFrom) return;

    const cellElement = event.event.target.closest('.cell');
    if (!cellElement) return;

    const targetRow = Number(cellElement.dataset.row);
    const targetCol = Number(cellElement.dataset.col);

    const { row: fromRow, col: fromCol } = this.dragFrom;
    const piece = this.board[fromRow][fromCol].piece;

    if (!piece) return;

    // ❌ Misma casilla
    if (fromRow === targetRow && fromCol === targetCol) {
      this.dragFrom = null;
      this.validMoves = [];
      return;
    }

    const isKingInCheck = this.checkMateService.isKingInCheck(
      this.board,
      piece.color
    );

    if (isKingInCheck) {
      this.aiThoughtHistory.push(
        'Invalid move: this move would leave my king in check.'
      );
      return;
    }

    // ❌ Validación de reglas (PEÓN, TORRE, ALFIL, etc.)
    const isValid = this.validateMovesService.choosePiece(
      piece,
      this.board,
      { row: fromRow, col: fromCol },
      { row: targetRow, col: targetCol }
    );
    const isSafe = this.checkMateService.isMoveSafe(
      this.board,
      { row: fromRow, col: fromCol },
      { row: targetRow, col: targetCol },
      piece.color
    );

    if (!isSafe) {
      this.aiThoughtHistory.push(
        'Invalid move: this move would leave my king in check.'
      );
      return;
    }
    if (!isValid) {
      console.log('Movimiento ilegal');
      this.dragFrom = null;
      this.validMoves = [];
      return;
    }

    const targetPiece = this.board[targetRow][targetCol].piece;

    // 🟥 Mismo color (doble seguridad)
    if (targetPiece && targetPiece.color === piece.color) {
      this.dragFrom = null;
      this.validMoves = [];
      return;
    }

    // ♜ ENROQUE
    const isCastling =
      piece.type === 'king' &&
      Math.abs(fromCol - targetCol) === 2 &&
      fromRow === targetRow;

    if (isCastling) {
      const isKingSide = targetCol > fromCol;

      const rookFromCol = isKingSide ? 7 : 0;
      const rookToCol = isKingSide ? targetCol - 1 : targetCol + 1;

      const rook = this.board[fromRow][rookFromCol].piece;

      if (!rook || rook.type !== 'rook') {
        this.dragFrom = null;
        this.validMoves = [];
        return;
      }

      this.movingPiece = {
        from: { row: fromRow, col: fromCol },
        to: { row: targetRow, col: targetCol },
      };

      setTimeout(() => {
        // mover rey
        this.board[targetRow][targetCol].piece = piece;
        this.board[fromRow][fromCol].piece = undefined;

        // mover torre
        this.board[fromRow][rookToCol].piece = rook;
        this.board[fromRow][rookFromCol].piece = undefined;

        piece.hasMoved = true;
        rook.hasMoved = true;

        this.afterMove(fromRow, fromCol, targetRow, targetCol);
      }, 300);

      this.dragFrom = null;
      this.validMoves = [];
      return;
    }

    // 🟢 Preparar animación
    this.movingPiece = {
      from: { row: fromRow, col: fromCol },
      to: { row: targetRow, col: targetCol },
    };

    // 🟥 CAPTURA
    if (targetPiece && targetPiece.color !== piece.color) {
      const value = this.pieceValues[targetPiece.type] ?? 0;

      if (piece.color === 'white') {
        this.scoreWhite += value;
        this.capturedBlack.push(targetPiece);
      } else {
        this.scoreBlack += value;
        this.capturedWhite.push(targetPiece);
      }

      this.board[targetRow][targetCol].capturing = true;

      setTimeout(() => {
        this.board[targetRow][targetCol].piece = piece;
        this.board[fromRow][fromCol].piece = undefined;

        this.board[targetRow][targetCol].capturing = false;

        this.afterMove(fromRow, fromCol, targetRow, targetCol);
      }, 300);

      this.dragFrom = null;
      this.validMoves = [];
      return;
    }

    // 🟦 MOVIMIENTO NORMAL
    setTimeout(() => {
      this.board[targetRow][targetCol].piece = piece;
      this.board[fromRow][fromCol].piece = undefined;

      this.afterMove(fromRow, fromCol, targetRow, targetCol);
    }, 300);

    this.dragFrom = null;
    this.validMoves = [];
  }

  dragFrom: { row: number; col: number } | null = null;

  startDrag(row: number, col: number) {
    const piece = this.board[row][col].piece;
    if (!piece) return;

    if (piece.color !== this.currentTurn) {
      console.log('No es el turno de', piece.color);
      return;
    }

    this.dragFrom = { row, col };

    // 🔥 AQUÍ se pide al backend
    // this.movementService
    //   .findValidMoves(piece, this.board, { row, col })
    //   .subscribe((moves: any) => {
    //     this.validMoves = moves;
    //     console.log('Casillas permitidas:', moves);
    //   });
  }

  getTurnLabel() {
    return this.currentTurn === 'white' ? 'Blancas' : 'Negras';
  }

  getValidMoves(
    piece: Piece,
    board: Board,
    from: { row: number; col: number }
  ) {
    this.movementService
      .findValidMoves(piece, board, from)
      .subscribe((moves: any) => {
        this.validMoves = moves;
        console.log('Movimientos válidos recibidos del servidor:', moves);
      });
  }
  isValidCell(row: number, col: number): boolean {
    return this.validMoves.some((move) => move.row === row && move.col === col);
  }
  isLastMoveCell(row: number, col: number): boolean {
    if (!this.lastMove) return false;

    const { from, to } = this.lastMove;

    return (
      (from.row === row && from.col === col) ||
      (to.row === row && to.col === col)
    );
  }
  getMoveTransform(row: number, col: number): string {
    if (!this.movingPiece) return '';

    const { from, to } = this.movingPiece;

    if (to.row !== row || to.col !== col) return '';

    const dx = (from.col - to.col) * 100;
    const dy = (from.row - to.row) * 100;

    return `translate(${dx}%, ${dy}%)`;
  }
  afterMove(
    fromRow: number,
    fromCol: number,
    targetRow: number,
    targetCol: number
  ) {
    this.lastMove = {
      from: { row: fromRow, col: fromCol },
      to: { row: targetRow, col: targetCol },
    };

    this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';

    const material = this.aiService.evaluateMaterial(this.board);
    this.scoreWhite = material.white;
    this.scoreBlack = material.black;

    console.log('Evaluación IA:', material);
    console.log('Fase:', this.aiService.evaluateGamePhase(this.board));
    console.log('King safety:', this.aiService.evaluateKingSafety(this.board));

    // 👇 AQUÍ ENTRA LA IA
    if (this.currentTurn === this.aiColor) {
      this.triggerAiMove();
    }
  }
  async triggerAiMove() {
    console.log('Turno IA, pensando...');

    const legalMoves = this.prepareAiOptions();

    if (legalMoves.length === 0) {
      console.warn('IA sin movimientos legales');
      return;
    }
    const possibleMoves =
      this.chooseMovementService.selectCandidates(legalMoves);
    const aiResult = await this.aiService.getBestMove(
      this.board,
      this.aiColor,
      this.aiThoughtHistory,
      this.lastMove
        ? `${this.lastMove.from.row},${this.lastMove.from.col}->${this.lastMove.to.row},${this.lastMove.to.col}`
        : null,
      possibleMoves
    );

    this.aiThoughtHistory.push(aiResult.explanation);

    this.applyAiMove(aiResult.from, aiResult.to);
  }

  applyAiMove(
    from: { row: number; col: number },
    to: { row: number; col: number }
  ) {
    const piece = this.board[from.row][from.col].piece;

    // ❌ pieza inexistente
    if (!piece) {
      this.aiThoughtHistory.push(
        'Invalid move: the selected piece does not exist.'
      );
      this.retryAiMove();
      return;
    }

    // ❌ misma casilla
    if (from.row === to.row && from.col === to.col) {
      this.aiThoughtHistory.push(
        'Invalid move: from and to squares are the same.'
      );
      this.retryAiMove();
      return;
    }

    // ❌ reglas básicas de ajedrez
    const isLegal = this.validateMovesService.choosePiece(
      piece,
      this.board,
      from,
      to
    );

    if (!isLegal) {
      this.aiThoughtHistory.push(
        'Invalid move: this move is illegal according to chess rules.'
      );
      this.retryAiMove();
      return;
    }

    // ❌ NO puede dejar al rey en jaque
    const isSafe = this.checkMateService.isMoveSafe(
      this.board,
      from,
      to,
      piece.color
    );

    if (!isSafe) {
      this.aiThoughtHistory.push(
        'Invalid move: this move would leave my king in check.'
      );
      this.retryAiMove();
      return;
    }

    const targetPiece = this.board[to.row][to.col].piece;

    // ❌ mismo color (seguridad extra)
    if (targetPiece && targetPiece.color === piece.color) {
      this.aiThoughtHistory.push(
        'Invalid move: I tried to capture my own piece.'
      );
      this.retryAiMove();
      return;
    }
    // ♜ ENROQUE
    const isCastling =
      piece.type === 'king' &&
      Math.abs(from.col - to.col) === 2 &&
      from.row === to.row;

    if (isCastling) {
      const isKingSide = to.col > from.col;

      const rookFromCol = isKingSide ? 7 : 0;
      const rookToCol = isKingSide ? to.col - 1 : to.col + 1;

      const rook = this.board[from.row][rookFromCol].piece;

      if (!rook || rook.type !== 'rook') {
        this.retryAiMove();
        return;
      }

      this.movingPiece = { from, to };

      setTimeout(() => {
        // mover rey
        this.board[to.row][to.col].piece = piece;
        this.board[from.row][from.col].piece = undefined;

        // mover torre
        this.board[from.row][rookToCol].piece = rook;
        this.board[from.row][rookFromCol].piece = undefined;

        // marcar como movidos
        piece.hasMoved = true;
        rook.hasMoved = true;

        this.afterMove(from.row, from.col, to.row, to.col);
      }, 300);

      return;
    }

    // 🟢 preparar animación
    this.movingPiece = { from, to };

    // 🟥 CAPTURA
    if (targetPiece && targetPiece.color !== piece.color) {
      const value = this.pieceValues[targetPiece.type] ?? 0;

      if (piece.color === 'white') {
        this.scoreWhite += value;
        this.capturedBlack.push(targetPiece);
      } else {
        this.scoreBlack += value;
        this.capturedWhite.push(targetPiece);
      }

      this.board[to.row][to.col].capturing = true;

      setTimeout(() => {
        this.board[to.row][to.col].piece = piece;
        this.board[from.row][from.col].piece = undefined;

        this.board[to.row][to.col].capturing = false;

        this.afterMove(from.row, from.col, to.row, to.col);
      }, 300);
      piece.hasMoved = true;
      return;
    }

    // 🟦 MOVIMIENTO NORMAL
    setTimeout(() => {
      this.board[to.row][to.col].piece = piece;
      this.board[from.row][from.col].piece = undefined;

      this.afterMove(from.row, from.col, to.row, to.col);

      piece.hasMoved = true;
    }, 300);
  }

  retryAiMove() {
    setTimeout(() => {
      this.triggerAiMove();
    }, 200);
  }
  chooseAiMove() {
    const moves = this.chooseMovementService.generateLegalMovesWithScore(
      this.board,
      this.aiColor
    );

    if (moves.length === 0) return null;

    const enrichedMoves = moves.map((m) => {
      const simulated = this.chooseMovementService.simulateMove(
        this.board,
        m.from,
        m.to
      );

      const isHanging = this.chooseMovementService.isHangingPiece(
        simulated,
        m.to,
        this.aiColor
      );

      return {
        ...m,
        isHanging,
      };
    });

    // 1️⃣ capturas primero
    // 2️⃣ luego las no colgadas
    enrichedMoves.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.isHanging !== b.isHanging) return a.isHanging ? 1 : -1;
      return 0;
    });

    // 3️⃣ tomamos un poco de aleatoriedad (no siempre la primera)
    const topMoves = enrichedMoves.slice(0, 5);
    const chosen = topMoves[Math.floor(Math.random() * topMoves.length)];

    return chosen;
  }
  prepareAiOptions(): AiMoveContext[] {
    const moves = this.chooseMovementService.generateLegalMovesWithContext(
      this.board,
      this.aiColor
    );

    return moves.map((m) => {
      // 🔹 pieza que hay en la casilla destino (ANTES de mover)
      const target = this.board[m.to.row][m.to.col].piece;

      // 🔹 ¿es una captura real?
      const isCapture = !!target && target.color !== this.aiColor;

      // 🔹 simulamos el movimiento
      const simulated = this.chooseMovementService.simulateMove(
        this.board,
        m.from,
        m.to
      );

      const isHangingAfterMove = this.chooseMovementService.isHangingPiece(
        simulated,
        m.to,
        this.aiColor
      );

      const attackersAfterMove =
        this.chooseMovementService.countAttackers(
          simulated,
          m.to,
          this.aiColor
        ) ?? 0;

      const givesCheck =
        this.checkMateService.isKingInCheck(
          simulated,
          this.aiColor === 'white' ? 'black' : 'white'
        ) ?? false;

      // 🔹 aquí se construye el contexto final
      return {
        from: m.from,
        to: m.to,
        piece: m.piece,

        isCapture,
        captures: isCapture ? target!.type : undefined,

        isHangingAfterMove,
        attackersAfterMove,
        givesCheck,
      };
    });
  }
}
