import type { Need, RoomDef, World } from '../world/types';
import { roomTileToWorldTile } from '../world/worldGrid';
import { findPathToNearest, type PathNode } from '../movement/bfsPath';

/**
 * Every walkable tile bordering an object's footprint — the places an avatar
 * could stand to use it. All of them, not just the first: a fixture's nearest
 * approach depends on where the avatar is coming from, and picking one tile
 * up front can also strand a perfectly reachable fixture behind a blocked
 * approach.
 */
export function findInteractionTiles(
  room: RoomDef,
  anchorX: number,
  anchorY: number,
  footprint: [number, number],
): Array<{ tx: number; ty: number }> {
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

  const out: Array<{ tx: number; ty: number }> = [];
  for (const [tx, ty] of candidates) {
    if (ty < 0 || ty >= room.height || tx < 0 || tx >= room.width) continue;
    if (room.walkable[ty][tx]) out.push({ tx, ty });
  }
  return out;
}

/** Where a fixture sits, in the room-local coordinates tapResponse.ts keys on. */
export interface FixtureRef {
  roomId: string;
  tx: number;
  ty: number;
}

// World-tile coordinates (R1's composited house), consumed directly by
// bfsPath.ts's world-grid pathing. The path is returned alongside the
// destination because finding the destination already required computing it —
// re-running BFS in the caller would be doing the same work twice.
export interface NeedTarget {
  tx: number;
  ty: number;
  path: PathNode[];
  // The fixture this route leads to. Carried back so the resolution routine
  // (R15) can respond on the object the child actually used, instead of
  // re-deriving it from wherever the avatar happens to be standing.
  fixture: FixtureRef;
}

/**
 * Where to walk to resolve a need (R9): the *nearest reachable* fixture of
 * the right kind, measured by real path length from `from`.
 *
 * Deliberately no preferred-room constant. The previous version named a room
 * id, which had already survived one floor-plan rename only by being
 * blind-patched, and by then meant "always cross the entire house to
 * `bath_wc_2`" even when standing next to the other toilet. Nothing here
 * knows a room name now, so a floor-plan change can't invalidate it.
 */
export function findNeedTarget(world: World, need: Need, from: PathNode): NeedTarget | null {
  const goals: PathNode[] = [];
  const fixtureByGoal = new Map<string, FixtureRef>();

  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.grid[y][x];
        if (tile.kind !== 'object' || !tile.isAnchor || tile.def.need !== need) continue;
        for (const local of findInteractionTiles(room, x, y, tile.def.footprint)) {
          const goal = roomTileToWorldTile(room, local.tx, local.ty);
          goals.push(goal);
          // First writer wins: two fixtures can in principle share an
          // approach tile, and either is a correct answer for it.
          const key = goal.tx + ',' + goal.ty;
          if (!fixtureByGoal.has(key)) fixtureByGoal.set(key, { roomId: room.id, tx: x, ty: y });
        }
      }
    }
  }

  const path = findPathToNearest(world, from, goals);
  if (!path) return null;

  const destination = path[path.length - 1];
  const fixture = fixtureByGoal.get(destination.tx + ',' + destination.ty)!;
  return { tx: destination.tx, ty: destination.ty, path, fixture };
}
