import { Injectable } from '@angular/core';
import { Board } from '../interfaces/Board.interface';
import OpenAI from 'openai';
import { environment } from '../../environments/environment';
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
    peon: 1,
    caballo: 3,
    alfil: 3,
    torre: 5,
    reina: 9,
    rey: 0,
  };

  constructor() {
    this.openAi = new OpenAI({
      apiKey: environment.open,
      dangerouslyAllowBrowser: true, // 👈 OBLIGATORIO en frontend
    });
  }

  async getBestMove(
    board: Board,
    aiColor: 'white' | 'black',
    aiThoughtHistory: string[],
    lastMove: string | null
  ): Promise<string> {
    const evaluation = this.evaluateBoard(board);
    const printBoard = this.boardToAiFormatWithCoords(board);
    const context = this.buildPromptContext(aiColor, lastMove, evaluation);
    const previousThoughts =
      aiThoughtHistory.length > 0
        ? aiThoughtHistory.map((t, i) => `${i + 1}. ${t}`).join('\n')
        : 'No previous strategic thoughts.';

    console.log('Board', printBoard);
    const prompt = `
You are a professional chess player.

${context}


Your last moves were:
${previousThoughts}
Current board position:
${printBoard}

The board is an 8x8 matrix of characters.
Uppercase letters represent WHITE pieces.
Lowercase letters represent BLACK pieces.
P/p pawn, R/r rook, N/n knight, B/b bishop, Q/q queen, K/k king.
A dot (.) means empty square.
Board orientation:
- Row 0 is Black's back rank
- Row 7 is White's back rank
- Columns go from a (0) to h (7)
- White pawns move UP (row decreases)
- Black pawns move DOWN (row increases)


Only suggest LEGAL chess moves.
Pawns capture diagonally, not forward.

Choose the best move for ${aiColor}.
Use 0-based indexing (0-7).

Return ONLY valid JSON in this format:
{
  "from": { "row": number, "col": number },
  "to": { "row": number, "col": number },
  "explanation": string
}

`;

    console.log('Prompt', prompt);
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
      temperature: 0.3,
    });

    console.log("Response", response.choices[0].message.content);

    return response.choices[0].message.content?.trim() ?? '';
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
          case 'reina':
            queens++;
            break;
          case 'torre':
            majorPieces++;
            break;
          case 'alfil':
          case 'caballo':
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
        if (piece?.type === 'rey') {
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
          board[r][c].piece?.type === 'peon' &&
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
          if (piece && piece.color !== color && piece.type !== 'rey') {
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
        case 'peon':
          value = 2;
          break;
        case 'caballo':
          value = 1.5;
          break;
        case 'alfil':
          value = 1;
          break;
        case 'reina':
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
          case 'caballo':
          case 'alfil':
            // desarrollado
            if (!isInitialRow(piece, row)) {
              score += 0.5 * sign;
            } else {
              score -= 0.3 * sign;
            }
            break;

          case 'torre':
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

          case 'reina':
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

    const THREAT_VALUES: Record<string, number> = {
      peon: 1,
      caballo: 3,
      alfil: 3,
      torre: 5,
      reina: 9,
      rey: 0,
    };

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const attacker = board[row][col].piece;
        if (!attacker) continue;

        const sign = attacker.color === 'white' ? 1 : -1;

        // escaneamos un radio cercano (amenazas inmediatas)
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;

            const r = row + dr;
            const c = col + dc;

            if (r < 0 || r > 7 || c < 0 || c > 7) continue;

            const target = board[r][c].piece;
            if (!target) continue;

            // solo amenazas a piezas enemigas
            if (target.color === attacker.color) continue;

            const targetValue = THREAT_VALUES[target.type] ?? 0;

            // cuanto más valiosa la pieza amenazada, más importa
            score += 0.15 * targetValue * sign;
          }
        }
      }
    }

    return score;
  }
  boardToAiFormatWithCoords(board: any[][]): string {
    let output = '    0 1 2 3 4 5 6 7\n';
    output += '    a b c d e f g h\n';

    for (let r = 0; r < 8; r++) {
      output += `${r} | `;
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell.piece) {
          output += '. ';
          continue;
        }

        const map: Record<string, string> = {
          peon: 'P',
          torre: 'R',
          caballo: 'N',
          alfil: 'B',
          reina: 'Q',
          rey: 'K',
        };

        const letter = map[cell.piece.type];
        output +=
          (cell.piece.color === 'white' ? letter : letter.toLowerCase()) + ' ';
      }
      output += '\n';
    }

    return output;
  }
}
