import { expect, test } from 'vitest';
import { parseRoomFile } from '../src/world/roomLoader';
import { loadWorld } from '../src/world/loadWorld';
import type { ObjectDef } from '../src/world/types';

/**
 * The `.room` authoring format enforces three of CLAUDE.md's architecture
 * constraints, and nothing tested it directly:
 *   - "World is authored as plain-text ASCII rooms."
 *   - "Walkability is always derived from object footprints, never
 *      hand-authored as a separate collision layer."
 *   - "One global legend for ASCII tile characters across all room files."
 *
 * The parser is also the project's first line of defence against a bad
 * layout: every authoring mistake it catches is one that would otherwise
 * reach the screen as a silently wrong house.
 */

const OBJECTS: Record<string, ObjectDef> = {
  K: { name: 'table', footprint: [2, 1], color: '#c9a37a' },
  T: { name: 'toilet', footprint: [1, 1], color: '#fff', need: 'washroom' },
  E: { name: 'playpen', footprint: [3, 2], color: '#ddd' },
};

function room(body: string, header: Partial<Record<string, unknown>> = {}): string {
  const lines = body.split('\n').filter((l) => l.length > 0);
  const h = {
    id: 'test',
    stage: 'home',
    size: `${lines[0].length}x${lines.length}`,
    pos: [0, 0],
    spawn: [1, 1],
    ...header,
  };
  const yaml = Object.entries(h)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`)
    .join('\n');
  return `---\n${yaml}\n---\n${lines.join('\n')}`;
}

const PLAIN = ['######', '#....#', '#....#', '#....#', '######'].join('\n');

test('walkability is derived, never authored', () => {
  // The grid says nothing about collision — it names objects, and the parser
  // works out what that blocks. A 2x1 table authored as a single `K` blocks
  // two tiles, and the second one is never written down anywhere.
  const parsed = parseRoomFile(
    'test.room',
    room(['######', '#.K..#', '#....#', '######'].join('\n')),
    OBJECTS,
  );

  expect(parsed.grid[1][2]).toMatchObject({ kind: 'object', isAnchor: true });
  expect(parsed.grid[1][3]).toMatchObject({ kind: 'object', isAnchor: false });
  expect(parsed.walkable[1][2]).toBe(false);
  expect(parsed.walkable[1][3]).toBe(false); // derived, not authored
  expect(parsed.walkable[1][4]).toBe(true);
  expect(parsed.walkable[2][2]).toBe(true); // footprint is 2 wide, 1 tall
});

test('a multi-tile footprint blocks its whole area', () => {
  const parsed = parseRoomFile(
    'test.room',
    room(['#######', '#.E...#', '#.....#', '#.....#', '#######'].join('\n')),
    OBJECTS,
  );
  for (let y = 1; y <= 2; y++) {
    for (let x = 2; x <= 4; x++) {
      expect(parsed.walkable[y][x], `(${x},${y}) should be blocked`).toBe(false);
    }
  }
  expect(parsed.walkable[3][2]).toBe(true);
  expect(parsed.walkable[1][5]).toBe(true);
});

test('walls and void are never walkable; floor and doors always are', () => {
  const parsed = parseRoomFile(
    'test.room',
    room(['######', '#..D.#', '# ...#', '######'].join('\n')),
    OBJECTS,
  );
  expect(parsed.grid[0][0]).toEqual({ kind: 'wall' });
  expect(parsed.walkable[0][0]).toBe(false);
  expect(parsed.grid[2][1]).toEqual({ kind: 'void' });
  expect(parsed.walkable[2][1]).toBe(false);
  expect(parsed.grid[1][3]).toEqual({ kind: 'door' });
  expect(parsed.walkable[1][3]).toBe(true);
});

test('an unknown character is an error, not a silently ignored tile', () => {
  // This is what makes the legend *global*: a room file cannot introduce a
  // character of its own, so there is only ever one place a symbol is defined.
  expect(() =>
    parseRoomFile('test.room', room(['####', '#.Z#', '####'].join('\n')), OBJECTS),
  ).toThrow(/unknown object char "Z"/);
});

test('a footprint overlapping anything but floor is an authoring error', () => {
  // Silently resolving this is how furniture ends up half-inside a wall, or
  // two objects end up sharing tiles, with the grid still looking fine.
  expect(() =>
    parseRoomFile('test.room', room(['#####', '#..K#', '#####'].join('\n')), OBJECTS),
  ).toThrow(/overlaps a non-floor tile/);

  expect(() =>
    parseRoomFile('test.room', room(['######', '#.KK.#', '######'].join('\n')), OBJECTS),
  ).toThrow(/overlaps a non-floor tile/);

  expect(() =>
    parseRoomFile('test.room', room(['######', '#.KD.#', '######'].join('\n')), OBJECTS),
  ).toThrow(/overlaps a non-floor tile/);
});

test('a grid that disagrees with its own header is an error', () => {
  // A mis-sized grid was a repeated failure mode across layout revisions
  // (docs/decisions.md), and it is invisible when reading ASCII by eye.
  expect(() =>
    parseRoomFile('test.room', room(PLAIN, { size: '6x9' }), OBJECTS),
  ).toThrow(/grid has 5 rows, header size says 9/);

  expect(() =>
    parseRoomFile('test.room', room(PLAIN, { size: '9x5' }), OBJECTS),
  ).toThrow(/row 0 has length 6, header size says width 9/);
});

test('a spawn tile that is not walkable is an error', () => {
  expect(() =>
    parseRoomFile('test.room', room(PLAIN, { spawn: [0, 0] }), OBJECTS),
  ).toThrow(/spawn .* is not a walkable tile/);
});

test('a room with no world position is an error', () => {
  // Every room has to be placed in the shared world grid (R1); a missing
  // pos would silently stack it on top of whatever sits at the origin.
  const text = room(PLAIN).replace(/^pos: .*$/m, '');
  expect(() => parseRoomFile('test.room', text, OBJECTS)).toThrow(/missing "pos"/);
});

test('the real house uses one legend and no hand-authored collision', () => {
  // The constraints above, checked against what actually ships rather than
  // against fixtures: every object tile in every room resolves to a def from
  // the single global legend, and every one of them is non-walkable purely
  // because it is an object.
  const world = loadWorld();
  const legend = new Set(Object.values(world.objects).map((d) => d.name));

  for (const r of Object.values(world.rooms)) {
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const tile = r.grid[y][x];
        if (tile.kind !== 'object') continue;
        expect(legend.has(tile.def.name), `${r.id} (${x},${y}) is off-legend`).toBe(true);
        expect(r.walkable[y][x], `${r.id} (${x},${y}) object is walkable`).toBe(false);
      }
    }
  }
});
