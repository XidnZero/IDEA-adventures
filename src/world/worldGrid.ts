import type { RoomDef, World } from './types';
import { TILE_PX } from '../engine/config';

/**
 * All rooms are composited into one continuous house-wide tile grid (R1) —
 * these helpers translate between a room's local grid and that shared world
 * space. Rooms never overlap (enforced in loadWorld.ts), so at most one room
 * ever matches a given world tile.
 */
export function findRoomAtWorldTile(
  world: World,
  wtx: number,
  wty: number,
): { room: RoomDef; tx: number; ty: number } | null {
  for (const room of Object.values(world.rooms)) {
    const tx = wtx - room.pos[0];
    const ty = wty - room.pos[1];
    if (tx >= 0 && tx < room.width && ty >= 0 && ty < room.height) {
      return { room, tx, ty };
    }
  }
  return null;
}

export function isWalkableWorldTile(world: World, wtx: number, wty: number): boolean {
  const hit = findRoomAtWorldTile(world, wtx, wty);
  return hit ? hit.room.walkable[hit.ty][hit.tx] : false;
}

export function roomTileToWorldTile(room: RoomDef, tx: number, ty: number): { tx: number; ty: number } {
  return { tx: room.pos[0] + tx, ty: room.pos[1] + ty };
}

export interface WorldBoundsPx {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getWorldBoundsPx(world: World): WorldBoundsPx {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of Object.values(world.rooms)) {
    minX = Math.min(minX, room.pos[0] * TILE_PX);
    minY = Math.min(minY, room.pos[1] * TILE_PX);
    maxX = Math.max(maxX, (room.pos[0] + room.width) * TILE_PX);
    maxY = Math.max(maxY, (room.pos[1] + room.height) * TILE_PX);
  }
  return { minX, minY, maxX, maxY };
}
