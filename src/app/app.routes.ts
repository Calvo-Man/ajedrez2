import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./chess-board/chess-board.component').then((m) => m.ChessBoardComponent),
  },
];
