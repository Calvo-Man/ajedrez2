import { Injectable } from '@angular/core';
import { Board } from '../interfaces/Board.interface';
import OpenAI from 'openai';
import { environment } from '../../environments/environment';
import { AiMoveContext } from '../interfaces/AiMoveContext';
import { ValidateMovesService } from './ValidateMoves.service';
export type GamePhase = 'opening' | 'middlegame' | 'endgame';

export type MaterialEvaluation = {
  white: number;
  black: number;
  diff: number;
  advantage: 'white' | 'black' | 'equal';
};
export type KingSafety = {
  white: 'safe' | 'exposed' | 'danger';
  black: 'safe' | 'exposed' | 'danger';
};

@Injectable({
  providedIn: 'root',
})
export class AiService {
  private openAi: OpenAI;

  private readonly PIECE_VALUES: Record<string, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 0,
  };

  constructor(private validateMovesService: ValidateMovesService) {
    this.openAi = new OpenAI({
      apiKey: environment.openApiKey,
      dangerouslyAllowBrowser: true, // 👈 OBLIGATORIO en frontend
    });
  }
  coordToChess(row: number, col: number): string {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rank = 8 - row;
    return `${files[col]}${rank}`;
  }

  async getBestMove(
    board: Board,
    aiColor: 'white' | 'black',
    aiThoughtHistory: string[],
    lastMove: string | null,
    possibleMoves: AiMoveContext[]
  ): Promise<{
    from: { row: number; col: number };
    to: { row: number; col: number };
    explanation: string;
  }> {
    const evaluation = this.evaluateBoard(board);
    const printBoard = this.boardToFEN(board, aiColor === 'white' ? 'w' : 'b');
    const context = this.buildPromptContext(aiColor, lastMove, evaluation);
    const movesDescription = possibleMoves
      .map((m, i) => {
        //const fromChess = this.coordToChess(m.from.row, m.from.col);
        //const toChess = this.coordToChess(m.to.row, m.to.col);
        const algebraic = this.toAlgebraic(m, board);

        return `
Index ${i}:
- Algebraic: ${algebraic}
- Piece: ${m.piece}
- Capture: ${m.isCapture ? m.captures : 'no'}
- Hanging after move: ${m.isHangingAfterMove ? 'yes' : 'no'}
- Attacked by enemies: ${m.attackersAfterMove}
- Gives check: ${m.givesCheck ? 'yes' : 'no'}
`;
      })
      .join('\n');

    const previousThoughts =
      aiThoughtHistory.length > 0
        ? aiThoughtHistory.slice(-5).join('\n')
        : 'No previous thoughts';

    const prompt = `
You are a chess grandmaster and positional analyst.
You do NOT calculate deep tactics.
You trust the provided analysis and must not invent moves.

${context}

Decision priorities (in order):
1. Never choose a move that loses material (Hanging after move: yes), unless it gives a decisive check.
2. Prefer safe captures.
3. Prefer safe checks.
4. Prefer improving piece activity or central control.
5. Avoid unnecessary pawn moves.

Move annotations meaning:
- Hanging after move: yes → the moved piece can be captured with material loss.
- Attacked by enemies → number of enemy attackers after the move.
- Gives check → immediate check.

Strategic memory (may be outdated):
${previousThoughts}

Important:
- These are past intentions, not guarantees.
- You MUST adapt if the current position contradicts them.


Board:
${printBoard}

Possible legal moves you are allowed to choose from:
${movesDescription}

Rules:
- You MUST choose one of the moves listed above
- Do NOT invent moves
- Never leave your king in check
- Use 0-based indexing

Return ONLY valid JSON:
{
  "index": number,
  "explanation": "Explain your choice for this move, considering positional and strategic factors."
}
`;

    console.log('AI Prompt:', prompt);
    const response = await this.openAi.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a chess grandmaster.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const raw = response.choices[0].message.content;

    if (!raw) {
      throw new Error('Empty AI response');
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
      console.log('AI response:', parsed);
      const selectedMove = possibleMoves[parsed.index];

      if (!selectedMove) {
        throw new Error('AI selected invalid move index');
      }

      return {
        from: selectedMove.from,
        to: selectedMove.to,
        explanation: parsed.explanation,
      };
    } catch {
      console.error('Invalid JSON:', raw);
      throw new Error('AI returned invalid JSON');
    }
  }
  private toAlgebraic(move: AiMoveContext, board: Board): string {
    const from = this.coordToChess(move.from.row, move.from.col);
    const to = this.coordToChess(move.to.row, move.to.col);

    // enroque
    if (move.piece === 'king' && Math.abs(move.from.col - move.to.col) === 2) {
      return move.to.col > move.from.col ? 'O-O' : 'O-O-O';
    }

    const pieceMap: Record<string, string> = {
      pawn: '',
      knight: 'N',
      bishop: 'B',
      rook: 'R',
      queen: 'Q',
      king: 'K',
    };

    const pieceLetter = pieceMap[move.piece] ?? '';

    const capture = move.isCapture ? 'x' : '';

    return `${pieceLetter}${capture}${to}`;
  }

  buildPromptContext(
    aiColor: 'white' | 'black',
    lastMove: string | null,

    evaluation: ReturnType<AiService['evaluateBoard']>
  ): string {
    const lines: string[] = [];

    const opponent = aiColor === 'white' ? 'black' : 'white';

    // 🎮 Rol de la IA
    lines.push(`You are playing as ${aiColor}. Your opponent is ${opponent}.`);

    // 🕒 Fase
    lines.push(`Game phase: ${evaluation.phase}.`);

    // ⚖️ Material (desde perspectiva IA)
    const mat = evaluation.material;

    if (mat.advantage === 'equal') {
      lines.push(`Material is equal.`);
    } else if (mat.advantage === aiColor) {
      lines.push(`You have a material advantage of ${mat.diff} points.`);
    } else {
      lines.push(`You are down ${mat.diff} material points.`);
    }

    // 👑 Seguridad del rey
    lines.push(
      `Your king is ${evaluation.kingSafety[aiColor]}. ` +
        `Opponent king is ${evaluation.kingSafety[opponent]}.`
    );

    // 🎯 Centro
    const centerScore =
      aiColor === 'white' ? evaluation.center : -evaluation.center;

    if (centerScore > 0.5) {
      lines.push(`You control the center.`);
    } else if (centerScore < -0.5) {
      lines.push(`Your opponent controls the center.`);
    } else {
      lines.push(`Center control is balanced.`);
    }

    // ♞ Actividad
    const activityScore =
      aiColor === 'white' ? evaluation.activity : -evaluation.activity;

    if (activityScore > 0.5) {
      lines.push(`Your pieces are more active.`);
    } else if (activityScore < -0.5) {
      lines.push(`Opponent pieces are more active.`);
    }

    // ⚔️ Amenazas
    const threatScore =
      aiColor === 'white' ? evaluation.threats : -evaluation.threats;

    if (threatScore > 1) {
      lines.push(`You have strong tactical threats.`);
    } else if (threatScore < -1) {
      lines.push(`Opponent has dangerous threats.`);
    }

    // 📈 Evaluación global
    const finalScore =
      aiColor === 'white' ? evaluation.score : -evaluation.score;

    if (finalScore > 2) {
      lines.push(`Position is clearly better for you.`);
    } else if (finalScore < -2) {
      lines.push(`Position is dangerous and requires defense.`);
    } else {
      lines.push(`Position is roughly equal.`);
    }

    // ♟️ Última jugada
    if (lastMove) {
      lines.push(`Last move played: ${lastMove}.`);
    }

    return lines.join(' ');
  }

  evaluateBoard(board: Board) {
    const phase = this.evaluateGamePhase(board);
    const material = this.evaluateMaterial(board);
    const kingSafety = this.evaluateKingSafety(board);
    const center = this.evaluateCenterControl(board);
    const activity = this.evaluatePieceActivity(board);
    const threats = this.evaluateThreats(board);

    let score = 0;

    // 1️⃣ Material (base)
    score += material.white - material.black;

    // 2️⃣ Centro
    if (phase !== 'endgame') {
      score += center * 1.2;
    }

    // 3️⃣ Seguridad del rey
    score += this.kingSafetyScore(kingSafety);

    // 4️⃣ Actividad de piezas
    score += activity;

    // 5️⃣ Amenazas tácticas
    score += threats;

    return {
      phase,
      material,
      kingSafety,
      center,
      activity,
      threats,
      score,
    };
  }

  evaluateMaterial(board: Board): MaterialEvaluation {
    let white = 0;
    let black = 0;

    for (const row of board) {
      for (const cell of row) {
        if (!cell.piece) continue;

        const value = this.PIECE_VALUES[cell.piece.type] ?? 0;

        if (cell.piece.color === 'white') {
          white += value;
        } else {
          black += value;
        }
      }
    }

    return {
      white,
      black,
      diff: Math.abs(white - black),
      advantage: white > black ? 'white' : black > white ? 'black' : 'equal',
    };
  }

  evaluateGamePhase(board: Board): GamePhase {
    let queens = 0;
    let minorPieces = 0; // alfil + caballo
    let majorPieces = 0; // torre

    for (const row of board) {
      for (const cell of row) {
        if (!cell.piece) continue;

        switch (cell.piece.type) {
          case 'queen':
            queens++;
            break;
          case 'rook':
            majorPieces++;
            break;
          case 'bishop':
          case 'knight':
            minorPieces++;
            break;
        }
      }
    }

    // ENDGAME: sin damas o muy poco material
    if (queens === 0 || minorPieces + majorPieces <= 4) {
      return 'endgame';
    }

    // OPENING: muchas piezas
    if (minorPieces + majorPieces >= 10) {
      return 'opening';
    }

    return 'middlegame';
  }

  evaluateKingSafety(board: Board): KingSafety {
    const kingPositions: Record<
      'white' | 'black',
      { row: number; col: number } | null
    > = {
      white: null,
      black: null,
    };

    // 1️⃣ Encontrar reyes
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col].piece;
        if (piece?.type === 'king') {
          kingPositions[piece.color] = { row, col };
        }
      }
    }

    const evaluate = (
      color: 'white' | 'black'
    ): 'safe' | 'exposed' | 'danger' => {
      const king = kingPositions[color];
      if (!king) return 'danger';

      let score = 0;

      // 2️⃣ Rey en el centro
      if (king.row >= 2 && king.row <= 5 && king.col >= 2 && king.col <= 5) {
        score += 2;
      }

      // 3️⃣ Peones delante del rey
      const direction = color === 'white' ? -1 : 1;
      for (let dc = -1; dc <= 1; dc++) {
        const r = king.row + direction;
        const c = king.col + dc;
        if (
          r >= 0 &&
          r < 8 &&
          c >= 0 &&
          c < 8 &&
          board[r][c].piece?.type === 'pawn' &&
          board[r][c].piece?.color === color
        ) {
          score -= 1;
        }
      }

      // 4️⃣ Piezas enemigas cerca
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const r = king.row + dr;
          const c = king.col + dc;
          if (r < 0 || r > 7 || c < 0 || c > 7) continue;

          const piece = board[r][c].piece;
          if (piece && piece.color !== color && piece.type !== 'king') {
            score += 1;
          }
        }
      }

      if (score >= 4) return 'danger';
      if (score >= 2) return 'exposed';
      return 'safe';
    };

    return {
      white: evaluate('white'),
      black: evaluate('black'),
    };
  }

  private kingSafetyScore(safety: KingSafety): number {
    const map = {
      safe: 0,
      exposed: -1.5,
      danger: -4,
    };

    return map[safety.white] - map[safety.black];
  }

  evaluateCenterControl(board: Board): number {
    let score = 0;

    const CENTER_SQUARES = [
      { row: 3, col: 3 },
      { row: 3, col: 4 },
      { row: 4, col: 3 },
      { row: 4, col: 4 },
    ];

    for (const { row, col } of CENTER_SQUARES) {
      const cell = board[row][col];
      if (!cell.piece) continue;

      const piece = cell.piece;

      let value = 0;

      switch (piece.type) {
        case 'pawn':
          value = 2;
          break;
        case 'knight':
          value = 1.5;
          break;
        case 'bishop':
          value = 1;
          break;
        case 'queen':
          value = 0.5;
          break;
      }

      score += piece.color === 'white' ? value : -value;
    }

    return score;
  }
  evaluatePieceActivity(board: Board): number {
    let score = 0;

    const isInitialRow = (piece: any, row: number) => {
      if (piece.color === 'white') {
        return row === 7;
      }
      return row === 0;
    };

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const cell = board[row][col];
        const piece = cell.piece;
        if (!piece) continue;

        const sign = piece.color === 'white' ? 1 : -1;

        switch (piece.type) {
          case 'knight':
          case 'bishop':
            // desarrollado
            if (!isInitialRow(piece, row)) {
              score += 0.5 * sign;
            } else {
              score -= 0.3 * sign;
            }
            break;

          case 'rook':
            // torre activa
            if (!isInitialRow(piece, row)) {
              score += 0.7 * sign;
            }

            // columna semi-abierta
            let blocked = false;
            for (
              let r = piece.color === 'white' ? row - 1 : row + 1;
              r >= 0 && r < 8;
              piece.color === 'white' ? r-- : r++
            ) {
              if (board[r][col].piece?.color === piece.color) {
                blocked = true;
                break;
              }
            }

            if (!blocked) {
              score += 0.4 * sign;
            }
            break;

          case 'queen':
            // reina demasiado pasiva
            if (isInitialRow(piece, row)) {
              score -= 0.2 * sign;
            }
            break;
        }
      }
    }

    return score;
  }

  evaluateThreats(board: Board): number {
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const attacker = board[r][c].piece;
        if (!attacker) continue;

        const sign = attacker.color === 'white' ? 1 : -1;

        for (let tr = 0; tr < 8; tr++) {
          for (let tc = 0; tc < 8; tc++) {
            const target = board[tr][tc].piece;
            if (!target) continue;
            if (target.color === attacker.color) continue;

            // ¿puede capturar?
            if (
              !this.validateMovesService.choosePiece(
                attacker,
                board,
                { row: r, col: c },
                { row: tr, col: tc }
              )
            ) {
              continue;
            }

            // SEE simple: valor objetivo - valor atacante
            const exchange =
              this.PIECE_VALUES[target.type] - this.PIECE_VALUES[attacker.type];

            if (exchange > 0) {
              score += exchange * 0.3 * sign;
            }
          }
        }
      }
    }

    return score;
  }

  boardToAiFormatWithCoords(board: any[][]): string {
    let output = '    1 2 3 4 5 6 7 8\n';
    output += '    a b c d e f g h\n';

    for (let r = 0; r < 8; r++) {
      output += `${8 - r} | `;
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell.piece) {
          output += '. ';
          continue;
        }

        const map: Record<string, string> = {
          pawn: 'P',
          rook: 'R',
          knight: 'N',
          bishop: 'B',
          queen: 'Q',
          king: 'K',
        };

        const letter = map[cell.piece.type];
        output +=
          (cell.piece.color === 'white' ? letter : letter.toLowerCase()) + ' ';
      }
      output += '\n';
    }

    return output;
  }
  boardToFEN(board: any[][], turn: 'w' | 'b'): string {
    let fen = '';

    for (let r = 0; r < 8; r++) {
      let empty = 0;

      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];

        if (!cell.piece) {
          empty++;
          continue;
        }

        if (empty > 0) {
          fen += empty;
          empty = 0;
        }

        const map: Record<string, string> = {
          pawn: 'p',
          rook: 'r',
          knight: 'n',
          bishop: 'b',
          queen: 'q',
          king: 'k',
        };

        let char = map[cell.piece.type];
        if (cell.piece.color === 'white') {
          char = char.toUpperCase();
        }

        fen += char;
      }

      if (empty > 0) fen += empty;
      if (r < 7) fen += '/';
    }

    // mínimo viable
    fen += ` ${turn} - - 0 1`;

    return fen;
  }
}
