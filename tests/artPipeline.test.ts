import { afterEach, expect, test, vi } from 'vitest';
import { loadWorld } from '../src/world/loadWorld';
import type { ObjectDef, RoomDef, Tile } from '../src/world/types';
import { createFakeCtx, installFakeImage } from './helpers/fakeCanvas';

/**
 * Art pipeline acceptance criteria from phase-1.md:
 *   - "Every visual object renders correctly with zero real art assets
 *      present (full placeholder run)."
 *   - "Every visual object swaps to real asset with zero code change when a
 *      matching file is added."
 *
 * Both are properties of every object type in the legend, so they're checked
 * against `world/objects.yaml` itself rather than a hand-listed subset — a
 * new object added to the legend is covered the moment it's authored.
 */

const world = loadWorld();
const objectDefs = Object.values(world.objects);

let restoreImage: (() => void) | null = null;
afterEach(() => {
  restoreImage?.();
  restoreImage = null;
});

/** A bare floor room with one object anchored at (1,1), sized to fit it. */
function roomWithObject(char: string, def: ObjectDef): RoomDef {
  const width = def.footprint[0] + 3;
  const height = def.footprint[1] + 3;
  const grid: Tile[][] = [];
  const walkable: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    grid.push(Array.from({ length: width }, (): Tile => ({ kind: 'floor' })));
    walkable.push(Array.from({ length: width }, () => true));
  }
  for (let fy = 0; fy < def.footprint[1]; fy++) {
    for (let fx = 0; fx < def.footprint[0]; fx++) {
      grid[1 + fy][1 + fx] = { kind: 'object', char, def, isAnchor: fx === 0 && fy === 0 };
      walkable[1 + fy][1 + fx] = false;
    }
  }
  return { id: 'test', stage: 'home', width, height, pos: [0, 0], spawn: [0, 0], grid, walkable };
}

async function freshRenderRoom() {
  vi.resetModules(); // assets.ts caches per-name; each test needs a clean cache
  return (await import('../src/render/renderRoom')).renderRoom;
}

test('every object in the legend renders a placeholder when no art exists', async () => {
  restoreImage = installFakeImage(() => false); // nothing on disk at all
  const renderRoom = await freshRenderRoom();

  for (const [char, def] of Object.entries(world.objects)) {
    const fake = createFakeCtx();
    renderRoom(fake.ctx, roomWithObject(char, def));

    expect(fake.count('drawImage'), `${def.name} should not have drawn art`).toBe(0);
    // The placeholder is a filled, stroked rounded rect (plus an optional
    // glyph): both must actually happen, or the object blank-renders.
    expect(fake.count('fill'), `${def.name} placeholder drew no fill`).toBeGreaterThan(0);
    expect(fake.count('stroke'), `${def.name} placeholder drew no stroke`).toBeGreaterThan(0);
    expect(
      fake.calls.some((c) => c.method === 'set:fillStyle' && c.args[0] === def.color),
      `${def.name} placeholder ignored its authored color`,
    ).toBe(true);
  }
});

test('every object in the legend swaps to real art with no code change', async () => {
  const requested: string[] = [];
  restoreImage = installFakeImage((src) => {
    requested.push(src);
    return src.endsWith('.svg'); // pretend every object has authored SVG art
  });
  const renderRoom = await freshRenderRoom();

  for (const [char, def] of Object.entries(world.objects)) {
    const room = roomWithObject(char, def);
    // First render kicks off the (synchronous, in this fake) load and draws
    // the placeholder; the second sees the resolved image. Real code hits the
    // same two-phase path across frames, which is why nothing ever blanks.
    renderRoom(createFakeCtx().ctx, room);

    const fake = createFakeCtx();
    renderRoom(fake.ctx, room);
    expect(fake.count('drawImage'), `${def.name} did not swap to real art`).toBe(1);
  }

  // SVG is tried before PNG (assets.ts) — a vector asset covers every
  // footprint/zoom combination, a raster one would need re-exporting.
  expect(requested.every((src) => src.endsWith('.svg'))).toBe(true);
  expect(requested).toContain('/assets/sofa.svg');
});

test('a missing SVG falls through to PNG before giving up', async () => {
  const requested: string[] = [];
  restoreImage = installFakeImage((src) => {
    requested.push(src);
    return src.endsWith('.png');
  });
  const renderRoom = await freshRenderRoom();

  const def = world.objects.B; // bed — no authored art today
  const room = roomWithObject('B', def);
  renderRoom(createFakeCtx().ctx, room);

  const fake = createFakeCtx();
  renderRoom(fake.ctx, room);
  expect(requested).toEqual(['/assets/bed.svg', '/assets/bed.png']);
  expect(fake.count('drawImage')).toBe(1);
});

test('rotated objects declare a footprint in already-rotated orientation', () => {
  // objects.yaml documents this rule; getting it wrong stretches the art
  // instead of turning it, which is invisible in a diff and obvious on screen.
  for (const def of objectDefs) {
    if (def.rotate !== 90 && def.rotate !== 270) continue;
    expect(def.footprint[0], `${def.name} rotated ${def.rotate} but is not portrait`).toBeLessThan(
      def.footprint[1],
    );
  }
});

test('the object legend is unambiguous — one character, one meaning', () => {
  const names = objectDefs.map((d) => d.name);
  expect(new Set(names).size, 'two legend characters share a name').toBe(names.length);
  for (const [char, def] of Object.entries(world.objects)) {
    expect(char, `legend key "${char}" must be a single character`).toHaveLength(1);
    expect('#. D'.includes(char), `legend key "${char}" collides with a terrain character`).toBe(
      false,
    );
    expect(def.footprint[0]).toBeGreaterThan(0);
    expect(def.footprint[1]).toBeGreaterThan(0);
  }
});
