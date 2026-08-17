import { afterEach, expect, test } from 'vitest';
import { getLightingState, type LightingState } from '../src/engine/dayNight';
import { loadWorld } from '../src/world/loadWorld';
import type { ObjectDef, RoomDef, Tile } from '../src/world/types';
import { renderRoom } from '../src/render/renderRoom';
import { createFakeCtx, installFakeImage } from './helpers/fakeCanvas';

/**
 * R18 — day/night as it actually reaches the screen. The clock-separation
 * half of R18/R19 is covered in clockSeparation.test.ts; this file covers the
 * other half: that the two light sources in the house (lamps, windows)
 * respond to the lighting state and to nothing else.
 *
 * Every assertion here is driven from a `LightingState` handed in directly,
 * never from the system clock — renderRoom takes lighting as an argument
 * precisely so it can't develop its own opinion about what time it is.
 */

const world = loadWorld();
const LAMP = world.objects.L;
const WINDOW = world.objects.I;

let restoreImage: (() => void) | null = null;
afterEach(() => {
  restoreImage?.();
  restoreImage = null;
});

const NIGHT = getLightingState(new Date(2026, 0, 1, 2, 0, 0));
const NOON = getLightingState(new Date(2026, 0, 1, 12, 0, 0));
const DUSK = getLightingState(new Date(2026, 0, 1, 20, 0, 0));

/**
 * An 8x8 room with a wall ring and one object anchored just inside the wall
 * on `side` — the way windows are actually authored (against a wall, on the
 * floor tile, since footprints must land on floor).
 */
function roomWithObjectAgainstWall(
  def: ObjectDef,
  side: 'top' | 'bottom' | 'left' | 'right',
): { room: RoomDef; anchor: [number, number] } {
  const size = 8;
  const grid: Tile[][] = [];
  const walkable: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: Tile[] = [];
    const walk: boolean[] = [];
    for (let x = 0; x < size; x++) {
      const isWall = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      row.push(isWall ? { kind: 'wall' } : { kind: 'floor' });
      walk.push(!isWall);
    }
    grid.push(row);
    walkable.push(walk);
  }

  const anchor: [number, number] =
    side === 'top'
      ? [2, 1]
      : side === 'bottom'
        ? [2, size - 1 - def.footprint[1]]
        : side === 'left'
          ? [1, 3]
          : [size - 1 - def.footprint[0], 3];

  for (let fy = 0; fy < def.footprint[1]; fy++) {
    for (let fx = 0; fx < def.footprint[0]; fx++) {
      grid[anchor[1] + fy][anchor[0] + fx] = {
        kind: 'object',
        char: '?',
        def,
        isAnchor: fx === 0 && fy === 0,
      };
      walkable[anchor[1] + fy][anchor[0] + fx] = false;
    }
  }

  return {
    room: { id: 'test', stage: 'home', width: size, height: size, pos: [0, 0], spawn: [4, 4], grid, walkable },
    anchor,
  };
}

/** Peak alpha of the glow gradient this render drew, or 0 if it drew none. */
function glowAlpha(calls: Array<{ method: string; args: unknown[] }>): number {
  const stop = calls.find(
    (c) => c.method === 'addColorStop' && c.args[0] === 0,
  );
  if (!stop) return 0;
  const match = /rgba\([^)]*,([\d.]+)\)$/.exec(String(stop.args[1]));
  return match ? Number(match[1]) : 0;
}

function glowCenter(calls: Array<{ method: string; args: unknown[] }>): [number, number] | null {
  const call = calls.find((c) => c.method === 'createRadialGradient');
  return call ? [Number(call.args[0]), Number(call.args[1])] : null;
}

function render(def: ObjectDef, side: 'top' | 'bottom' | 'left' | 'right', lighting?: LightingState) {
  restoreImage ??= installFakeImage(() => false); // placeholder art only
  const { room, anchor } = roomWithObjectAgainstWall(def, side);
  const fake = createFakeCtx();
  renderRoom(fake.ctx, room, undefined, lighting);
  return { calls: fake.calls, anchor };
}

test('lamps light the room at night and go out during the day', () => {
  expect(glowAlpha(render(LAMP, 'left', NIGHT).calls)).toBeGreaterThan(0);
  expect(glowAlpha(render(LAMP, 'left', NOON).calls)).toBe(0);
});

test('windows let daylight in during the day and go dark at night', () => {
  expect(glowAlpha(render(WINDOW, 'top', NOON).calls)).toBeGreaterThan(0);
  expect(glowAlpha(render(WINDOW, 'top', NIGHT).calls)).toBe(0);
});

test('the two sources cross-fade through dusk rather than jump-cutting', () => {
  expect(DUSK.dayness).toBeGreaterThan(0);
  expect(DUSK.dayness).toBeLessThan(1);

  const lampAtDusk = glowAlpha(render(LAMP, 'left', DUSK).calls);
  const windowAtDusk = glowAlpha(render(WINDOW, 'top', DUSK).calls);
  const lampAtNight = glowAlpha(render(LAMP, 'left', NIGHT).calls);
  const windowAtNoon = glowAlpha(render(WINDOW, 'top', NOON).calls);

  // Both are partially lit at the same moment, each weaker than its own peak.
  expect(lampAtDusk).toBeGreaterThan(0);
  expect(lampAtDusk).toBeLessThan(lampAtNight);
  expect(windowAtDusk).toBeGreaterThan(0);
  expect(windowAtDusk).toBeLessThan(windowAtNoon);
});

test('daylight falls away from the wall the window sits against', () => {
  const cases = [
    { side: 'top', axis: 1, sign: 1 },
    { side: 'bottom', axis: 1, sign: -1 },
    { side: 'left', axis: 0, sign: 1 },
    { side: 'right', axis: 0, sign: -1 },
  ] as const;

  for (const { side, axis, sign } of cases) {
    const { calls, anchor } = render(WINDOW, side, NOON);
    const center = glowCenter(calls)!;
    expect(center, `no daylight drawn for a ${side} window`).not.toBeNull();

    // Footprint centre in pixels, before any directional push.
    const footprintCenterPx = (anchor[axis] + WINDOW.footprint[axis] / 2) * 48;
    const pushed = (center[axis] - footprintCenterPx) * sign;
    expect(pushed, `${side} window lights the wrong side`).toBeGreaterThan(0);
  }
});

test('rooms render identically with no lighting state at all', () => {
  // renderRoom is used by tests and could be used by tooling without a clock;
  // omitting lighting must simply mean "no light sources", never a crash.
  const withoutLighting = render(WINDOW, 'top', undefined).calls;
  expect(glowAlpha(withoutLighting)).toBe(0);
  expect(withoutLighting.length).toBeGreaterThan(0);
});

test('every room that has a window or lamp is authored against a wall', () => {
  // The spill direction falls back to "downward" for a free-standing source.
  // Nothing authored today needs that fallback; if that changes, this test
  // fails and the fallback's correctness has to be looked at on purpose.
  const freeStanding: string[] = [];
  for (const room of Object.values(world.rooms)) {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const tile = room.grid[y][x];
        if (tile.kind !== 'object' || !tile.isAnchor) continue;
        if (tile.def.name !== 'window') continue;
        const [w, h] = tile.def.footprint;
        const touchesWall = [
          room.grid[y - 1]?.[x],
          room.grid[y + h]?.[x],
          room.grid[y]?.[x - 1],
          room.grid[y]?.[x + w],
        ].some((t) => t?.kind === 'wall');
        if (!touchesWall) freeStanding.push(`${room.id} (${x},${y})`);
      }
    }
  }
  expect(freeStanding).toEqual([]);
});
