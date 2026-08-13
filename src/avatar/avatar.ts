import { TILE_PX } from '../engine/config';
import type { AvatarPalette } from './sprite';

export type Direction = 'down' | 'up' | 'left' | 'right';

export interface Avatar {
  id: string;
  palette: AvatarPalette;
  roomId: string;
  x: number; // px within current room
  y: number; // px within current room
  facing: Direction;
}

export interface AvatarProfile {
  id: string;
  palette: AvatarPalette;
}

// Placeholder palettes stand in for the photo-based avatars (R5: "Avatar
// from photo... Author-only, one-off") until real per-kid art exists.
export const AVATAR_PROFILES: AvatarProfile[] = [
  { id: 'kid1', palette: { body: '#5aa9c9', clothing: '#f2c14e', hair: '#6b4226' } },
  { id: 'kid2', palette: { body: '#c97ab0', clothing: '#7ec98c', hair: '#2e2a26' } },
];

export function createAvatar(profile: AvatarProfile, roomId: string, x: number, y: number): Avatar {
  return { id: profile.id, palette: profile.palette, roomId, x, y, facing: 'down' };
}

export function tileCenterPx(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX };
}
