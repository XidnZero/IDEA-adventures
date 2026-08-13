import { TILE_PX } from '../engine/config';

export type Direction = 'down' | 'up' | 'left' | 'right';

export interface Avatar {
  id: string;
  color: string;
  roomId: string;
  x: number; // px within current room
  y: number; // px within current room
  facing: Direction;
}

export function tileCenterPx(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX };
}
