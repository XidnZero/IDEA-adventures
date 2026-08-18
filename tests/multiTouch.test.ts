import { expect, test } from 'vitest';
import {
  beginDrag,
  createDragState,
  endDrag,
  updateDragTarget,
} from '../src/movement/dragSteer';
import { readSources } from './helpers/sourceScan';

/**
 * Multi-pointer handling. CLAUDE.md records that the Phase 0 spike observed
 * "whole-hand taps and drags" from this age group — which produces several
 * pointers at once, arriving and leaving in an arbitrary order.
 *
 * The original handlers tracked no pointer identity at all, so a second
 * finger landing stole the steering and a second finger *lifting* ended the
 * walk while the first was still pressed: the avatar stopped dead under a
 * hand that was still on the screen. Reproduced in the built app before
 * fixing (see docs/decisions.md).
 */

test('a second finger cannot steal the drag', () => {
  const drag = createDragState();
  expect(beginDrag(drag, 1, 100, 100)).toBe(true);
  expect(drag.pointerId).toBe(1);

  // Second finger lands somewhere else entirely.
  expect(beginDrag(drag, 2, 900, 900)).toBe(false);
  expect(drag.pointerId).toBe(1);
  expect(drag.targetPxX).toBe(100);
  expect(drag.targetPxY).toBe(100);
});

test('a second finger cannot steer', () => {
  const drag = createDragState();
  beginDrag(drag, 1, 100, 100);

  updateDragTarget(drag, 2, 900, 900);
  expect(drag.targetPxX).toBe(100);

  updateDragTarget(drag, 1, 300, 400);
  expect(drag.targetPxX).toBe(300);
  expect(drag.targetPxY).toBe(400);
});

test('a second finger lifting does not end the walk', () => {
  // The exact failure: the avatar stopped while a hand was still pressed.
  const drag = createDragState();
  beginDrag(drag, 1, 100, 100);

  endDrag(drag, 2);
  expect(drag.active).toBe(true);
  expect(drag.pointerId).toBe(1);

  // Steering still works afterwards.
  updateDragTarget(drag, 1, 500, 500);
  expect(drag.targetPxX).toBe(500);

  endDrag(drag, 1);
  expect(drag.active).toBe(false);
  expect(drag.pointerId).toBeNull();
});

test('the drag is available again once its owner lifts', () => {
  const drag = createDragState();
  beginDrag(drag, 1, 100, 100);
  endDrag(drag, 1);

  expect(beginDrag(drag, 2, 700, 700)).toBe(true);
  expect(drag.pointerId).toBe(2);
  expect(drag.targetPxX).toBe(700);
});

test('the owner can re-press without deadlocking itself', () => {
  const drag = createDragState();
  beginDrag(drag, 1, 100, 100);
  expect(beginDrag(drag, 1, 200, 200)).toBe(true);
  expect(drag.targetPxX).toBe(200);
});

test('a whole-hand press, in any release order, keeps the walk alive', () => {
  // Five fingers land; four leave in a scrambled order. As long as the owner
  // is still down, the avatar is still being steered.
  const drag = createDragState();
  const owner = 3;
  beginDrag(drag, owner, 100, 100);
  for (const id of [1, 2, 4, 5]) beginDrag(drag, id, 800, 800);
  expect(drag.pointerId).toBe(owner);

  for (const id of [5, 1, 4, 2]) {
    endDrag(drag, id);
    expect(drag.active, `lifting ${id} ended the drag`).toBe(true);
  }
  updateDragTarget(drag, owner, 250, 250);
  expect(drag.targetPxX).toBe(250);

  endDrag(drag, owner);
  expect(drag.active).toBe(false);
});

test('steering is ignored entirely when no drag is held', () => {
  const drag = createDragState();
  updateDragTarget(drag, 1, 900, 900);
  expect(drag.targetPxX).toBe(0);
  expect(drag.active).toBe(false);
});

test('pointer capture can never break the interaction', () => {
  // setPointerCapture throws if the pointer is already gone. It used to be
  // the first statement in the handler, so that throw aborted everything
  // after it and the tap did nothing at all — silent, because an exception
  // in an event listener has no visible effect. It now runs last, guarded.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const captures = [...main.matchAll(/setPointerCapture/g)];
  expect(captures.length).toBeGreaterThan(0);

  for (const m of captures) {
    const before = main.slice(Math.max(0, m.index! - 200), m.index!);
    expect(before, 'setPointerCapture is not inside a try').toMatch(/try\s*\{[^}]*$/);
  }
});

test('the mini-game drag has an owner too', () => {
  // Same class of bug inside the overlay: a second finger lifting would drop
  // the shape being dragged.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  expect(main).toMatch(/miniGamePointerId/);
  // Cleared when the overlay closes, or the next open inherits a stale owner
  // and the first drag does nothing.
  expect(main).toMatch(/miniGame = null;\s*\n\s*miniGamePointerId = null;/);
});
