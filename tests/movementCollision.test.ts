import { expect, test } from 'vitest';
import { loadWorld } from '../src/world/loadWorld';
import { createAvatar, AVATAR_PROFILES } from '../src/avatar/avatar';
import { createDragState, stepDragSteer } from '../src/movement/dragSteer';
import { startAutoWalk, isAutoWalkDone, stepAutoWalk } from '../src/movement/autoWalk';
import { findPath } from '../src/movement/bfsPath';
import { findNeedTarget } from '../src/needs/needTargets';
import { isWalkableWorldTile, roomTileToWorldTile } from '../src/world/worldGrid';
import { AVATAR_RADIUS_TILES, SPAWN_ROOM, TILE_PX } from '../src/engine/config';

/**
 * Movement collision. Neither movement system had a test, and a wall the
 * avatar can slip through is both the most visible possible bug and one that
 * a casual play-through easily misses — it only shows up at the one corner
 * nobody happened to walk into.
 *
 * These are property tests over the *real* house rather than a fixture, so
 * they cover the actual geometry that ships, including the kitchen's stepped
 * corner and the tiles behind every piece of furniture.
 */

const world = loadWorld();
const R = AVATAR_RADIUS_TILES * TILE_PX;

// main.ts clamps dt to 0.05s, so this is the largest step the avatar can ever
// take in one frame. Using it here keeps the test honest about tunnelling.
const MAX_DT = 0.05;

const DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** The avatar's whole body must be on walkable ground, not just its centre. */
function bodyIsClear(x: number, y: number): boolean {
  return (
    isWalkableWorldTile(world, Math.floor((x - R) / TILE_PX), Math.floor(y / TILE_PX)) &&
    isWalkableWorldTile(world, Math.floor((x + R) / TILE_PX), Math.floor(y / TILE_PX)) &&
    isWalkableWorldTile(world, Math.floor(x / TILE_PX), Math.floor((y - R) / TILE_PX)) &&
    isWalkableWorldTile(world, Math.floor(x / TILE_PX), Math.floor((y + R) / TILE_PX))
  );
}

function walkableTiles(): Array<{ tx: number; ty: number }> {
  const out: Array<{ tx: number; ty: number }> = [];
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (room.walkable[y][x]) out.push(roomTileToWorldTile(room, x, y));
      }
    }
  }
  return out;
}

test('drag-steering can never push the avatar into a wall, from anywhere in the house', () => {
  const tiles = walkableTiles();
  expect(tiles.length).toBeGreaterThan(500); // sanity: we really are covering the house

  const escapes: string[] = [];
  for (const tile of tiles) {
    for (const [dx, dy] of DIRECTIONS) {
      const avatar = createAvatar(
        AVATAR_PROFILES[0],
        SPAWN_ROOM,
        (tile.tx + 0.5) * TILE_PX,
        (tile.ty + 0.5) * TILE_PX,
      );
      // Some tile centres are legitimately too tight for the body (a 1-tile
      // gap beside furniture). Only start from ones that are clear.
      if (!bodyIsClear(avatar.x, avatar.y)) continue;

      const drag = createDragState();
      drag.active = true;

      // Shove hard in this direction for a while: the target is far outside
      // the house, so the avatar presses into whatever it reaches.
      for (let step = 0; step < 20; step++) {
        drag.targetPxX = avatar.x + dx * 10_000;
        drag.targetPxY = avatar.y + dy * 10_000;
        stepDragSteer(world, avatar, drag, MAX_DT);
        if (!bodyIsClear(avatar.x, avatar.y)) {
          escapes.push(
            `from (${tile.tx},${tile.ty}) dir (${dx},${dy}) step ${step} -> ` +
              `(${avatar.x.toFixed(1)},${avatar.y.toFixed(1)})`,
          );
          break;
        }
      }
    }
  }
  expect(escapes.slice(0, 10)).toEqual([]);
});

test('drag-steering slides along a wall instead of sticking to it', () => {
  // Axis-separated movement is the whole reason a toddler dragging roughly
  // toward a doorway still gets there. If both axes were rejected together,
  // brushing a wall at an angle would stop the avatar dead.
  const room = world.rooms[SPAWN_ROOM];
  const start = roomTileToWorldTile(room, 2, 6); // near the left wall, open floor
  const avatar = createAvatar(
    AVATAR_PROFILES[0],
    SPAWN_ROOM,
    (start.tx + 0.5) * TILE_PX,
    (start.ty + 0.5) * TILE_PX,
  );
  const drag = createDragState();
  drag.active = true;

  const startY = avatar.y;
  // Push down-and-left: left is blocked by the wall, down is open.
  for (let i = 0; i < 40; i++) {
    drag.targetPxX = avatar.x - 10_000;
    drag.targetPxY = avatar.y + 10_000;
    stepDragSteer(world, avatar, drag, MAX_DT);
  }
  expect(avatar.y).toBeGreaterThan(startY + TILE_PX); // slid along, didn't stick
  expect(bodyIsClear(avatar.x, avatar.y)).toBe(true);
});

test('auto-walk stays on walkable ground for its whole route', () => {
  // R9's route crosses rooms and squeezes past furniture; every intermediate
  // position matters, not just the endpoints.
  const spawn = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawn, spawn.spawn[0], spawn.spawn[1]);

  for (const need of ['hunger', 'washroom', 'hygiene'] as const) {
    const target = findNeedTarget(world, need, from)!;
    const avatar = createAvatar(
      AVATAR_PROFILES[0],
      SPAWN_ROOM,
      (from.tx + 0.5) * TILE_PX,
      (from.ty + 0.5) * TILE_PX,
    );
    const walk = startAutoWalk(target.path);

    const offPath: string[] = [];
    let frames = 0;
    while (!isAutoWalkDone(walk) && frames < 20_000) {
      stepAutoWalk(avatar, walk, MAX_DT);
      frames++;
      const centreTile = {
        tx: Math.floor(avatar.x / TILE_PX),
        ty: Math.floor(avatar.y / TILE_PX),
      };
      if (!isWalkableWorldTile(world, centreTile.tx, centreTile.ty)) {
        offPath.push(`${need}: frame ${frames} at (${centreTile.tx},${centreTile.ty})`);
        break;
      }
    }
    expect(offPath).toEqual([]);
    expect(isAutoWalkDone(walk), `${need} auto-walk never finished`).toBe(true);
    // It actually arrives, rather than finishing somewhere else.
    expect(Math.floor(avatar.x / TILE_PX)).toBe(target.tx);
    expect(Math.floor(avatar.y / TILE_PX)).toBe(target.ty);
  }
});

test('the avatar cannot tunnel through a wall in one frame', () => {
  // Speed x clamped dt gives the largest possible single step; it must stay
  // well under the body radius, or a fast frame could jump a wall outright.
  const maxStepPx = 2.6 * TILE_PX * MAX_DT;
  expect(maxStepPx).toBeLessThan(R);
});

test('a path always exists back to spawn from anywhere the avatar can stand', () => {
  // "No dead ends" (CLAUDE.md) from the avatar's side: wherever it ends up,
  // it can always get home.
  const spawn = world.rooms[SPAWN_ROOM];
  const home = roomTileToWorldTile(spawn, spawn.spawn[0], spawn.spawn[1]);
  const stuck: string[] = [];
  for (const tile of walkableTiles()) {
    if (!findPath(world, tile, home)) stuck.push(`(${tile.tx},${tile.ty})`);
  }
  expect(stuck).toEqual([]);
});
