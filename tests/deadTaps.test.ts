import { expect, test } from 'vitest';
import {
  activeSparkleCount,
  addSparkle,
  createSparkleState,
  renderSparkles,
  SPARKLE_MS,
} from '../src/interaction/sparkle';
import { createFakeCtx } from './helpers/fakeCanvas';
import { readSources } from './helpers/sourceScan';

/**
 * R8 — phase-1.md's acceptance criterion is that the dead-tap rate is *zero*:
 * every tap produces some response. Object taps bounce and floor taps start a
 * walk, but a tap on a wall, on the void between rooms, or on an unreachable
 * tile did nothing visible until the sparkle burst existed.
 */

test('a tap anywhere draws something, including on a wall or the void', () => {
  // The burst is pure screen geometry — it neither knows nor cares what was
  // under the tap, which is exactly what makes the zero-dead-tap guarantee
  // hold without a list of cases to keep in sync.
  const state = createSparkleState();
  addSparkle(state, -9999, -9999, 0); // far outside any room

  const fake = createFakeCtx();
  renderSparkles(fake.ctx, state, 10);
  expect(fake.count('stroke')).toBeGreaterThan(0);
  expect(fake.count('fill')).toBeGreaterThan(0);
});

test('bursts fade out and are pruned', () => {
  const state = createSparkleState();
  addSparkle(state, 100, 100, 0);
  expect(activeSparkleCount(state, 0)).toBe(1);
  expect(activeSparkleCount(state, SPARKLE_MS + 1)).toBe(0);

  renderSparkles(createFakeCtx().ctx, state, SPARKLE_MS + 1);
  expect(state.sparkles).toHaveLength(0);

  // Rendering with nothing alive must be a no-op, not a stray draw call.
  const fake = createFakeCtx();
  renderSparkles(fake.ctx, state, SPARKLE_MS + 2);
  expect(fake.calls).toEqual([]);
});

test('a stuck pointer cannot grow the burst list without bound', () => {
  const state = createSparkleState();
  for (let i = 0; i < 500; i++) addSparkle(state, i, i, i);
  expect(state.sparkles.length).toBeLessThanOrEqual(32);
});

test('overlapping taps all render', () => {
  const one = createSparkleState();
  addSparkle(one, 10, 10, 200);
  const single = createFakeCtx();
  renderSparkles(single.ctx, one, 250);

  const three = createSparkleState();
  addSparkle(three, 10, 10, 200);
  addSparkle(three, 20, 20, 200);
  addSparkle(three, 30, 30, 200);
  const multi = createFakeCtx();
  renderSparkles(multi.ctx, three, 250);

  // Proportional rather than an exact count, so restyling the burst doesn't
  // break this — what matters is that no live burst is skipped.
  expect(single.count('stroke')).toBeGreaterThan(0);
  expect(multi.count('stroke')).toBe(single.count('stroke') * 3);
  expect(multi.count('fill')).toBe(single.count('fill') * 3);
});

test('every shape is drawn with a dark halo under a bright fill', () => {
  // The burst lands on cream floor, cream mini-game backdrop, dark walls and
  // black void. A single-tone burst disappears on one end or the other, so
  // both tones must always be present.
  const state = createSparkleState();
  addSparkle(state, 100, 100, 0);
  const fake = createFakeCtx();
  renderSparkles(fake.ctx, state, 10);

  const colors = fake.calls
    .filter((c) => c.method === 'set:strokeStyle' || c.method === 'set:fillStyle')
    .map((c) => String(c.args[0]));
  expect(colors.some((c) => c.startsWith('rgba(90,66,32')), 'no dark halo').toBe(true);
  expect(colors.some((c) => /rgba\(255,2[0-9]{2}/.test(c)), 'no bright shape').toBe(true);
});

test('the burst carries no fail-state or hint semantics', () => {
  // R14: the same friendly burst appears whether the tap did something or
  // nothing, so it can never read as "wrong" or as an instruction. Nothing
  // in the module may branch on what was tapped.
  const source = readSources().find((f) => f.path === 'interaction/sparkle.ts')!.code;
  expect(source).not.toMatch(/walkable|RoomDef|World\b|Tile\b|isValid|blocked/);
});

test('main.ts sparkles before it branches on what was tapped', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;

  // Scope to the pointerdown handler; the imports at the top of the file
  // mention every one of these names and would otherwise match first.
  const start = main.indexOf("addEventListener('pointerdown'");
  const end = main.indexOf("addEventListener('pointermove'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const handler = main.slice(start, end);

  // The guarantee is positional: the call sits above every world-layer
  // branch, so a new branch cannot be added that forgets it. If this fails,
  // check that the sparkle really is unconditional rather than just moving
  // the assertion.
  const sparkleAt = handler.indexOf('addSparkle(');
  expect(sparkleAt).toBeGreaterThan(-1);

  for (const laterBranch of ['hitTestNeedBubble(', 'findRoomAtWorldTile(', 'drag.active = true']) {
    expect(
      handler.indexOf(laterBranch),
      `${laterBranch} should follow the sparkle`,
    ).toBeGreaterThan(sparkleAt);
  }

  // ...and it must not itself be inside a conditional.
  const line = handler.split('\n').find((l) => l.includes('addSparkle('))!;
  expect(line.trim().startsWith('addSparkle(')).toBe(true);
});

test('the mini-game overlay sparkles on taps that hit no shape', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const start = main.indexOf("addEventListener('pointerdown'");
  const end = main.indexOf("addEventListener('pointermove'");
  const handler = main.slice(start, end);

  // R17 lets the mini-game declare its own input model, but "no dead taps"
  // is not scoped to the world layer — a tap landing on no shape would
  // otherwise do nothing. It must sparkle before the shape hit-test runs.
  const sparkleAt = handler.indexOf('addSparkle(miniGameSparkles');
  expect(sparkleAt).toBeGreaterThan(-1);
  expect(handler.indexOf('handleToyboxPointerDown(')).toBeGreaterThan(sparkleAt);

  // The overlay renders in screen space, so it must not reuse the
  // world-space list — the same coordinates would land somewhere else.
  expect(main).toMatch(/renderSparkles\(ctx, miniGameSparkles/);
  expect(main).toMatch(/renderSparkles\(ctx, sparkles/);
});
