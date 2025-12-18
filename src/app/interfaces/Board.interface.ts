import { Piece } from "./Piece.interface";

export type Board = {
  color: number;
  piece?: Piece;
  capturing?: boolean;
}[][];