import { expect, test } from 'vitest';
import {
  createToyboxSort,
  handleToyboxPointerDown,
  handleToyboxPointerMove,
  handleToyboxPointerUp,
  hitTestExit,
  updateToyboxSort,
  type ToyboxSortState,
} from '../src/minigame/toyboxSort';
import { readSources } from './helpers/sourceScan';

/**
 * R17 — the mini-game's rules are the app's hard prohibitions restated: no
 * score, no timer-as-pressure, no wrong-answer punish, one-tap exit,
 * infinitely replayable. It's the one place where "just a little feedback
 * that you got it wrong" would feel natural to add, which is exactly why it
 * needs holding down.
 */

const W = 1200;
const H = 800;

function binCentre(state: ToyboxSortState, color: string): { x: number; y: number } {
  const bin = state.bins.find((b) => b.color === color)!;
  return { x: bin.cx * W, y: bin.cy * H };
}

function dragTo(state: ToyboxSortState, shapeId: string, to: { x: number; y: number }, now = 0) {
  const s = state.shapes.find((sh) => sh.id === shapeId)!;
  handleToyboxPointerDown(state, s.x * W, s.y * H, W, H);
  handleToyboxPointerMove(state, to.x, to.y, W, H);
  handleToyboxPointerUp(state, W, H, now);
}

/** Sorts everything, the way a child eventually would. */
function sortAll(state: ToyboxSortState, now = 0) {
  // Re-read each time: picking a shape up reorders the array (bring-to-front).
  for (let guard = 0; guard < 50; guard++) {
    const next = state.shapes.find((s) => !s.sorted);
    if (!next) return;
    dragTo(state, next.id, binCentre(state, next.color), now);
  }
  throw new Error('shapes never all sorted');
}

test('a wrong drop calmly returns the shape home, with no other consequence', () => {
  const state = createToyboxSort();
  const shape = state.shapes[0];
  const wrongColor = state.bins.find((b) => b.color !== shape.color)!.color;
  const home = { x: shape.homeX, y: shape.homeY };

  dragTo(state, shape.id, binCentre(state, wrongColor));

  const after = state.shapes.find((s) => s.id === shape.id)!;
  expect(after.sorted).toBe(false);
  expect(after.x).toBe(home.x);
  expect(after.y).toBe(home.y);
  expect(after.poppedAt).toBeNull(); // no animation fires to mark it as a miss
  // Nothing anywhere else changed either — no counter, no flag, no penalty.
  expect(state.allDoneAt).toBeNull();
  expect(state.shapes.filter((s) => s.sorted)).toHaveLength(0);
});

test('a drop on empty space behaves exactly like a wrong drop', () => {
  // Identical outcomes matter: if a miss looked different from a mis-sort,
  // the difference would be readable as "that one was wrong".
  const state = createToyboxSort();
  const shape = state.shapes[0];

  dragTo(state, shape.id, { x: W * 0.5, y: H * 0.08 });

  const after = state.shapes.find((s) => s.id === shape.id)!;
  expect(after.sorted).toBe(false);
  expect(after.x).toBe(after.homeX);
  expect(after.y).toBe(after.homeY);
  expect(after.poppedAt).toBeNull();
});

test('wrong drops can be repeated forever without changing anything', () => {
  const state = createToyboxSort();
  const shape = state.shapes[0];
  const wrongColor = state.bins.find((b) => b.color !== shape.color)!.color;

  for (let i = 0; i < 200; i++) {
    dragTo(state, shape.id, binCentre(state, wrongColor), i * 10);
  }
  const after = state.shapes.find((s) => s.id === shape.id)!;
  expect(after.sorted).toBe(false);
  expect(state.shapes.filter((s) => s.sorted)).toHaveLength(0);
  expect(state.allDoneAt).toBeNull();
});

test('a correct drop sorts the shape and marks it for the pop animation', () => {
  const state = createToyboxSort();
  const shape = state.shapes[0];

  dragTo(state, shape.id, binCentre(state, shape.color), 1234);

  const after = state.shapes.find((s) => s.id === shape.id)!;
  expect(after.sorted).toBe(true);
  expect(after.poppedAt).toBe(1234);
});

test('finishing reshuffles a fresh set — there is no end state to reach', () => {
  const state = createToyboxSort();
  sortAll(state, 0);
  expect(state.shapes.every((s) => s.sorted)).toBe(true);
  expect(state.allDoneAt).toBe(0);

  // The calm pause holds briefly...
  updateToyboxSort(state, 500);
  expect(state.shapes.every((s) => s.sorted)).toBe(true);

  // ...then a brand-new set appears, unsorted, with the game running again.
  updateToyboxSort(state, 5000);
  expect(state.allDoneAt).toBeNull();
  expect(state.shapes).toHaveLength(6);
  expect(state.shapes.every((s) => !s.sorted)).toBe(true);
});

test('the game can be completed over and over with no accumulating state', () => {
  const state = createToyboxSort();
  let now = 0;
  for (let round = 0; round < 5; round++) {
    sortAll(state, now);
    now += 5000;
    updateToyboxSort(state, now);
    expect(state.shapes).toHaveLength(6);
    expect(state.shapes.every((s) => !s.sorted)).toBe(true);
  }
  // Six shapes, three colours, two each — every round, forever.
  const byColor = new Map<string, number>();
  for (const s of state.shapes) byColor.set(s.color, (byColor.get(s.color) ?? 0) + 1);
  expect([...byColor.values()]).toEqual([2, 2, 2]);
});

test('the exit is always live, including mid-drag and at the moment of completion', () => {
  const state = createToyboxSort();
  const exit = { x: W - 24 - 64, y: 24 + 64 };
  expect(hitTestExit(W, exit.x, exit.y)).toBe(true);

  // Mid-drag: the exit does not become unavailable while holding a shape.
  const s = state.shapes[0];
  handleToyboxPointerDown(state, s.x * W, s.y * H, W, H);
  expect(state.draggingId).not.toBeNull();
  expect(hitTestExit(W, exit.x, exit.y)).toBe(true);
  handleToyboxPointerUp(state, W, H, 0);

  // And during the all-done pause.
  sortAll(state, 100);
  expect(state.allDoneAt).not.toBeNull();
  expect(hitTestExit(W, exit.x, exit.y)).toBe(true);
});

test('the mini-game renders no text of any kind', () => {
  // CLAUDE.md's no-instructional-text rule. The exit is a drawn glyph, not a
  // labelled button, and nothing here may caption a shape or a bin.
  const code = readSources().find((f) => f.path === 'minigame/toyboxSort.ts')!.code;
  expect(code).not.toMatch(/fillText|strokeText|measureText/);
});

test('the mini-game keeps no score, streak, or attempt count', () => {
  const state = createToyboxSort();
  // Every field on the state, and on a shape, must be geometry or animation
  // bookkeeping — nothing that could accumulate into a judgement.
  expect(Object.keys(state).sort()).toEqual([
    'allDoneAt',
    'bins',
    'dragDX',
    'dragDY',
    'draggingId',
    'shapes',
  ]);
  expect(Object.keys(state.shapes[0]).sort()).toEqual([
    'color',
    'dragging',
    'homeX',
    'homeY',
    'id',
    'poppedAt',
    'shapeType',
    'sorted',
    'x',
    'y',
  ]);
});

test('sorting is by colour only — shape type is decoration', () => {
  // v1 deliberately picks one matching rule (docs/decisions.md). If shape
  // type ever joined the rule, a child matching on colour alone would start
  // getting drops rejected, which is the closest thing to a wrong answer
  // this game could develop.
  const code = readSources().find((f) => f.path === 'minigame/toyboxSort.ts')!.code;
  expect(code).toMatch(/bin\.color === s\.color/);
  expect(code).not.toMatch(/shapeType ===|=== s\.shapeType/);
});
