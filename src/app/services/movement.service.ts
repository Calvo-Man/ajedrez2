import { Injectable } from '@angular/core';
import { Piece } from '../interfaces/Piece.interface';
import { HttpClient } from '@angular/common/http';
import { Board } from '../interfaces/Board.interface';

@Injectable({
  providedIn: 'root',
})
export class MovementService {
  apiUrl = 'http://localhost:8081';
  constructor(private http: HttpClient) {}


  findValidMoves(
    piece: Piece,
    board: Board,
    from: { row: number; col: number }
  ) {
    console.log(
      'Petición enviada al servidor para movimientos válidos',
      piece,
      from,
      board
    );

    return this.http.post(
      `${this.apiUrl}/valid-moves`,
      {
        piece,
        board,
        from,
      }
    );
  }
}
