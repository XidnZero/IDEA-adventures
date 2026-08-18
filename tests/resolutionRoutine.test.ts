import { expect, test } from 'vitest';
import { loadWorld } from '../src/world/loadWorld';
import { findNeedTarget } from '../src/needs/needTargets';
import { findRoomAtWorldTile, roomTileToWorldTile } from '../src/world/worldGrid';
import {
  createTapResponseState,
  getTapResponseOffsetPx,
  triggerTapResponse,
} from '../src/interaction/tapResponse';
import { SPAWN_ROOM } from '../src/engine/config';
import { readSources } from './helpers/sourceScan';

/**
 * R15 — the resolution routine. The original version bounced a parent NPC in
 * the room where the need was met, and did nothing at all if that room had
 * no parent. Parents are only authored in `living` and `kitchen`, while
 * washroom and hygiene both resolve in a bathroom, so two of the three needs
 * were acknowledged by nothing whatsoever. These tests are what that gap
 * looked like, written so it can't come back.
 */

const world = loadWorld();

function roomsWithParents(): Set<string> {
  const out = new Set<string>();
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const t = room.grid[y][x];
        if (t.kind === 'object' && t.isAnchor && t.def.kind === 'npc') out.add(room.id);
      }
    }
  }
  return out;
}

test('every need resolves at a fixture the routine can respond on', () => {
  const spawn = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawn, spawn.spawn[0], spawn.spawn[1]);

  for (const need of ['hunger', 'washroom', 'hygiene'] as const) {
    const target = findNeedTarget(world, need, from)!;
    expect(target.fixture, `${need} has no fixture`).toBeTruthy();

    // The fixture reference must point at the real anchor of a real object
    // of the right kind, in room-local coordinates.
    const room = world.rooms[target.fixture.roomId];
    const tile = room.grid[target.fixture.ty][target.fixture.tx];
    expect(tile.kind).toBe('object');
    if (tile.kind !== 'object') throw new Error('unreachable');
    expect(tile.isAnchor).toBe(true);
    expect(tile.def.need).toBe(need);

    // ...and the avatar really does end up standing next to it.
    const destRoom = findRoomAtWorldTile(world, target.tx, target.ty)!;
    expect(destRoom.room.id).toBe(target.fixture.roomId);
  }
});

test('at least one need resolves in a room with no parent', () => {
  // This is the condition that made the original bug possible. If the house
  // ever gains a parent in every room the test stops being meaningful, and
  // the explicit failure is the signal to revisit rather than quietly lose
  // the coverage.
  const spawn = world.rooms[SPAWN_ROOM];
  const from = roomTileToWorldTile(spawn, spawn.spawn[0], spawn.spawn[1]);
  const parents = roomsWithParents();

  const parentless = (['hunger', 'washroom', 'hygiene'] as const).filter(
    (need) => !parents.has(findNeedTarget(world, need, from)!.fixture.roomId),
  );
  expect(parentless.length).toBeGreaterThan(0);
});

test('the routine responds on the fixture, so it fires with or without a parent', () => {
  // The fixture bounce is unconditional in celebrateResolution — it happens
  // before the parent search, not inside it. That ordering is the fix.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const fn = main.slice(
    main.indexOf('function celebrateResolution'),
    main.indexOf('function resizeCanvas'),
  );
  expect(fn).toBeTruthy();

  const fixtureBounce = fn.indexOf('triggerTapResponse(tapResponse, fixture.roomId');
  const parentLoop = fn.indexOf('for (let y = 0');
  expect(fixtureBounce).toBeGreaterThan(-1);
  expect(parentLoop).toBeGreaterThan(fixtureBounce);

  // And it isn't wrapped in a conditional of its own.
  const line = fn.split('\n').find((l) => l.includes('triggerTapResponse(tapResponse, fixture'))!;
  expect(line.trim().startsWith('triggerTapResponse(')).toBe(true);
});

test('a bounce actually produces visible movement, and is retriggerable', () => {
  // R16's "infinitely repeatable" applies to the resolution routine too —
  // resolving the same need twice must animate both times.
  const state = createTapResponseState();
  triggerTapResponse(state, 'bath_wc_2', 3, 2, 1000);

  let peak = 0;
  for (let t = 1000; t < 1400; t += 10) {
    peak = Math.max(peak, Math.abs(getTapResponseOffsetPx(state, 'bath_wc_2', 3, 2, t)));
  }
  expect(peak).toBeGreaterThan(0);

  // Expires on its own...
  expect(getTapResponseOffsetPx(state, 'bath_wc_2', 3, 2, 9999)).toBe(0);
  // ...and fires again from scratch.
  triggerTapResponse(state, 'bath_wc_2', 3, 2, 10_000);
  let secondPeak = 0;
  for (let t = 10_000; t < 10_400; t += 10) {
    secondPeak = Math.max(secondPeak, Math.abs(getTapResponseOffsetPx(state, 'bath_wc_2', 3, 2, t)));
  }
  expect(secondPeak).toBeCloseTo(peak, 5);
});

test('bounces are keyed per object, so one does not move another', () => {
  const state = createTapResponseState();
  triggerTapResponse(state, 'living', 3, 10, 0);
  expect(getTapResponseOffsetPx(state, 'living', 3, 10, 50)).not.toBe(0);
  expect(getTapResponseOffsetPx(state, 'living', 4, 10, 50)).toBe(0);
  expect(getTapResponseOffsetPx(state, 'kitchen', 3, 10, 50)).toBe(0);
});

test('a cancelled auto-walk cancels its pending celebration', () => {
  // Taking manual control mid-route must not leave a fixture queued to
  // bounce the next time any auto-walk happens to finish.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  expect(main).toMatch(/autoWalkStates\[activeIndex\] = null;\s*\n\s*autoWalkFixtures\[activeIndex\] = null;/);
  // And completing a walk clears it too.
  expect(main).toMatch(/autoWalkStates\[i\] = null;\s*\n\s*autoWalkFixtures\[i\] = null;/);
});
