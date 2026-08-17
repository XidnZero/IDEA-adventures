import { expect, test } from 'vitest';
import { loadWorld } from '../src/world/loadWorld';
import type { World } from '../src/world/types';
import { findRoomAtWorldTile, isWalkableWorldTile, roomTileToWorldTile } from '../src/world/worldGrid';
import { findPath } from '../src/movement/bfsPath';
import { findNeedTarget } from '../src/needs/needTargets';
import { SPAWN_ROOM } from '../src/engine/config';

/**
 * R2/R4/R9 — the house layout checks. Every previous layout revision was
 * validated by a throwaway script, which meant the next revision started from
 * nothing; these are the same checks, checked in.
 *
 * The important one is `door graph matches the intended adjacency`. Overlap,
 * pairing, and reachability all pass happily on a layout that is internally
 * consistent but connects the wrong rooms together — that was the actual
 * failure mode across several revisions, and only comparing the derived graph
 * against an intended adjacency list catches it.
 */

// The floor plan as authored, in one place. Changing the house means changing
// this list in the same commit — that's the point.
const INTENDED_ADJACENCY = [
  'kitchen <-> bath_wc_2',
  'living <-> bedroom_3',
  'living <-> kitchen',
  'living <-> main_hall',
  'living <-> store_pantry',
  'main_bedroom <-> bath_wc_1',
  'main_hall <-> bedroom_2',
  'main_hall <-> main_bedroom',
];

const INTENDED_FIXTURES: Record<string, string[]> = {
  bath_wc_1: ['sink', 'toilet'],
  bath_wc_2: ['shower', 'toilet'],
  bedroom_2: ['beanbag_yellow', 'bed', 'piano', 'toy', 'window'],
  bedroom_3: ['beanbag_blue', 'bed', 'playpen', 'toy', 'window'],
  kitchen: ['fridge', 'parent', 'table', 'window'],
  living: [
    'beanbag_blue',
    'beanbag_grey',
    'beanbag_yellow',
    'lamp',
    'parent',
    'piano',
    'playpen',
    'sofa',
    'table',
    'toybox',
    'tv',
  ],
  main_bedroom: ['bed', 'bed', 'frame', 'lamp', 'mirror', 'tv', 'window'],
  main_hall: [], // deliberately empty — it's a connector, not a room to play in
  store_pantry: ['beanbag_grey', 'wardrobe'],
};

const ORTHOGONAL: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const world = loadWorld();

function edgeKey(a: string, b: string): string {
  return [a, b].sort().join(' <-> ');
}

/**
 * Two rooms are connected when a walkable tile in one is orthogonally adjacent
 * to a walkable tile in the other, in composited world space (R1). Derived
 * from walkability rather than from the `D` character, because that's what
 * actually governs whether an avatar can get through — an opening authored as
 * plain floor connects just as much as one authored as a door mat.
 */
function deriveAdjacency(world: World): string[] {
  const edges = new Set<string>();
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (!room.walkable[y][x]) continue;
        const w = roomTileToWorldTile(room, x, y);
        for (const [dx, dy] of ORTHOGONAL) {
          const hit = findRoomAtWorldTile(world, w.tx + dx, w.ty + dy);
          if (!hit || hit.room.id === room.id) continue;
          if (hit.room.walkable[hit.ty][hit.tx]) edges.add(edgeKey(room.id, hit.room.id));
        }
      }
    }
  }
  return [...edges].sort();
}

function walkableWorldTiles(roomId: string): Array<{ tx: number; ty: number }> {
  const room = world.rooms[roomId];
  const out: Array<{ tx: number; ty: number }> = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (room.walkable[y][x]) out.push(roomTileToWorldTile(room, x, y));
    }
  }
  return out;
}

test('the world loads — rooms are disjoint in composited world space', () => {
  // loadWorld() throws on overlap; reaching here at all is the check. The
  // assertions pin the room set so a silently dropped room file is caught.
  expect(Object.keys(world.rooms).sort()).toEqual(Object.keys(INTENDED_FIXTURES).sort());
  expect(world.stages.home.rooms.sort()).toEqual(Object.keys(INTENDED_FIXTURES).sort());
});

test('every authored door tile leads into another room', () => {
  const orphans: string[] = [];
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        if (room.grid[y][x].kind !== 'door') continue;
        const w = roomTileToWorldTile(room, x, y);
        const leadsOut = ORTHOGONAL.some(([dx, dy]) => {
          const hit = findRoomAtWorldTile(world, w.tx + dx, w.ty + dy);
          return !!hit && hit.room.id !== room.id && hit.room.walkable[hit.ty][hit.tx];
        });
        if (!leadsOut) orphans.push(`${room.id} door at (${x},${y})`);
      }
    }
  }
  expect(orphans).toEqual([]);
});

test('the derived door graph matches the intended floor plan', () => {
  const intended = INTENDED_ADJACENCY.map((edge) => {
    const [a, b] = edge.split(' <-> ');
    return edgeKey(a, b);
  }).sort();
  expect(deriveAdjacency(world)).toEqual(intended);
});

test('each room contains exactly the fixtures it is meant to', () => {
  const actual: Record<string, string[]> = {};
  for (const room of Object.values(world.rooms)) {
    const names: string[] = [];
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.grid[y][x];
        if (tile.kind === 'object' && tile.isAnchor) names.push(tile.def.name);
      }
    }
    actual[room.id] = names.sort();
  }
  const intended = Object.fromEntries(
    Object.entries(INTENDED_FIXTURES).map(([k, v]) => [k, [...v].sort()]),
  );
  expect(actual).toEqual(intended);
});

test('every room is reachable on foot from the spawn tile', () => {
  const spawnRoom = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawnRoom, spawnRoom.spawn[0], spawnRoom.spawn[1]);
  expect(isWalkableWorldTile(world, from.tx, from.ty)).toBe(true);

  const unreachable: string[] = [];
  for (const room of Object.values(world.rooms)) {
    const to = roomTileToWorldTile(room, room.spawn[0], room.spawn[1]);
    if (!findPath(world, from, to)) unreachable.push(room.id);
  }
  expect(unreachable).toEqual([]);
});

test('no walkable tile anywhere in the house is walled off from the rest', () => {
  // "No locked doors / dead ends" (CLAUDE.md) taken literally: a pocket of
  // floor an avatar can never reach is a dead end even if no door is involved.
  // A single flood fill from spawn answers this for every tile at once —
  // notably including tiles stranded *behind furniture*, which the per-room
  // door checks above cannot see.
  const spawnRoom = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawnRoom, spawnRoom.spawn[0], spawnRoom.spawn[1]);

  const reached = new Set<string>([`${from.tx},${from.ty}`]);
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const [dx, dy] of ORTHOGONAL) {
      const tx = node.tx + dx;
      const ty = node.ty + dy;
      const key = `${tx},${ty}`;
      if (reached.has(key) || !isWalkableWorldTile(world, tx, ty)) continue;
      reached.add(key);
      queue.push({ tx, ty });
    }
  }

  const stranded: string[] = [];
  for (const roomId of Object.keys(world.rooms)) {
    for (const tile of walkableWorldTiles(roomId)) {
      if (!reached.has(`${tile.tx},${tile.ty}`)) {
        stranded.push(`${roomId} world(${tile.tx},${tile.ty})`);
      }
    }
  }
  expect(stranded).toEqual([]);
});

test('every need has a fixture that auto-walk can actually route to', () => {
  const spawnRoom = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawnRoom, spawnRoom.spawn[0], spawnRoom.spawn[1]);

  for (const need of ['hunger', 'washroom', 'hygiene'] as const) {
    const target = findNeedTarget(world, need);
    expect(target, `no fixture found for ${need}`).not.toBeNull();
    const path = findPath(world, from, target!);
    expect(path, `no path to the ${need} fixture`).not.toBeNull();
    // R9: the route has to cross doors, not teleport — it's a real BFS over
    // the composited grid, so every step must be a walkable neighbour.
    for (let i = 1; i < path!.length; i++) {
      const step = Math.abs(path![i].tx - path![i - 1].tx) + Math.abs(path![i].ty - path![i - 1].ty);
      expect(step).toBe(1);
      expect(isWalkableWorldTile(world, path![i].tx, path![i].ty)).toBe(true);
    }
  }
});

test('auto-walk routes between rooms, not just within the spawn room', () => {
  // R9's acceptance criterion is specifically "routes through doors around
  // furniture", so pin at least one genuinely cross-room route.
  const from = roomTileToWorldTile(world.rooms.living, 12, 12);
  const washroom = findNeedTarget(world, 'washroom')!;
  const path = findPath(world, from, washroom)!;
  expect(path).not.toBeNull();

  const roomsVisited = new Set(
    path.map((n) => findRoomAtWorldTile(world, n.tx, n.ty)?.room.id ?? '?'),
  );
  expect(roomsVisited.size).toBeGreaterThan(1);
  expect(roomsVisited.has('living')).toBe(true);
});
