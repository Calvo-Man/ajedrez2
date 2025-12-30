export type AiMoveContext = {
  from: { row: number; col: number };
  to: { row: number; col: number };
  piece: string;

  captures?: string;
  isCapture: boolean;

  isHangingAfterMove: boolean;
  attackersAfterMove: number;

  givesCheck: boolean;
};
