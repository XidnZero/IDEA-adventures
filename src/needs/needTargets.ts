import type { Need, ObjectDef, RoomDef, World } from '../world/types';
import { roomTileToWorldTile } from '../world/worldGrid';

/** First walkable tile bordering an object's footprint — where an avatar stands to use it. */
export function findInteractionTile(
  room: RoomDef,
  anchorX: number,
  anchorY: number,
  footprint: [number, number],
): { tx: number; ty: number } | null {
  const [w, h] = footprint;
  const candidates: Array<[number, number]> = [];
  for (let x = anchorX - 1; x <= anchorX + w; x++) {
    candidates.push([x, anchorY - 1]);
    candidates.push([x, anchorY + h]);
  }
  for (let y = anchorY; y < anchorY + h; y++) {
    candidates.push([anchorX - 1, y]);
    candidates.push([anchorX + w, y]);
  }
  for (const [tx, ty] of candidates) {
    if (ty < 0 || ty >= room.height || tx < 0 || tx >= room.width) continue;
    if (room.walkable[ty][tx]) return { tx, ty };
  }
  return null;
}

// World-tile coordinates (R1's composited house), consumed directly by
// bfsPath.ts's world-grid pathing.
export interface NeedTarget {
  tx: number;
  ty: number;
}

/** Finds where to walk to resolve a need. R9: the kitchen toilet is the default washroom target. */
export function findNeedTarget(world: World, need: Need): NeedTarget | null {
  const matches: Array<{ roomId: string; ax: number; ay: number; def: ObjectDef }> = [];
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.grid[y][x];
        if (tile.kind === 'object' && tile.isAnchor && tile.def.need === need) {
          matches.push({ roomId: room.id, ax: x, ay: y, def: tile.def });
        }
      }
    }
  }
  if (matches.length === 0) return null;

  const preferred = matches.find((m) => m.roomId === 'toilet_kitchen') ?? matches[0];
  const room = world.rooms[preferred.roomId];
  const tile = findInteractionTile(room, preferred.ax, preferred.ay, preferred.def.footprint);
  if (!tile) return null;
  return roomTileToWorldTile(room, tile.tx, tile.ty);
}
