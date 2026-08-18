import { expect, test } from 'vitest';
import {
  createSessionClock,
  MAX_FRAME_SECONDS,
  tickSessionClock,
} from '../src/engine/sessionClock';
import { advanceNeedState, createNeedState } from '../src/needs/needState';
import { AVATAR_SPEED_TILES_PER_SEC, AVATAR_RADIUS_TILES } from '../src/engine/config';
import { readSources } from './helpers/sourceScan';

/**
 * CLAUDE.md's first hard prohibition: "No offline decay. Needs advance ONLY
 * while the app is foregrounded and open. Closing the app freezes all state,
 * full stop."
 *
 * Until now this was enforced by a single inline `Math.min(0.05, ...)` in
 * main.ts's frame loop, with nothing testing it. Deleting that one call would
 * have reintroduced offline decay by the back door — requestAnimationFrame
 * resuming after an hour in the background hands over one enormous frame, and
 * an unclamped clock would jump an hour forward in a single step.
 */

test('an hour in the background costs at most one frame of play time', () => {
  const clock = createSessionClock();
  tickSessionClock(clock, 0);
  tickSessionClock(clock, 16); // a normal frame

  const beforeGap = clock.ms;
  tickSessionClock(clock, 16 + 60 * 60 * 1000); // resumed an hour later
  expect(clock.ms - beforeGap).toBeLessThanOrEqual(MAX_FRAME_SECONDS * 1000);
});

test('repeated backgrounding cannot accumulate into real time', () => {
  // A day spent opening and closing the app, twenty times over.
  const clock = createSessionClock();
  let stamp = 0;
  tickSessionClock(clock, stamp);
  for (let i = 0; i < 20; i++) {
    stamp += 60 * 60 * 1000;
    tickSessionClock(clock, stamp);
  }
  // Twenty hours of wall time; at most twenty clamped frames of play time.
  expect(clock.ms).toBeLessThanOrEqual(20 * MAX_FRAME_SECONDS * 1000);
  expect(clock.ms).toBeLessThan(1500);
});

test('a need cannot fire from time spent closed', () => {
  // The behavioural version: the shortest need interval is minutes, so no
  // number of resumes should ever be enough to trigger one on its own.
  const clock = createSessionClock();
  const state = createNeedState(clock.ms);
  let stamp = 0;
  tickSessionClock(clock, stamp);

  for (let i = 0; i < 500; i++) {
    stamp += 10 * 60 * 1000; // ten minutes closed, every time
    const dt = tickSessionClock(clock, stamp);
    advanceNeedState(state, clock.ms, dt, false);
  }
  expect(state.active).toBeNull();
});

test('ordinary frames are not clamped', () => {
  // The guard must not quietly slow the game down at normal frame rates.
  const clock = createSessionClock();
  tickSessionClock(clock, 0);
  for (let i = 1; i <= 60; i++) tickSessionClock(clock, i * 16.7);
  expect(clock.ms).toBeCloseTo(60 * 16.7, 5);
});

test('the first frame contributes nothing', () => {
  // There is no previous frame to measure against, and page-load time is not
  // play time.
  const clock = createSessionClock();
  expect(tickSessionClock(clock, 12345)).toBe(0);
  expect(clock.ms).toBe(0);
});

test('the clock never runs backwards', () => {
  const clock = createSessionClock();
  tickSessionClock(clock, 1000);
  tickSessionClock(clock, 1016);
  const before = clock.ms;
  expect(tickSessionClock(clock, 500)).toBe(0);
  expect(clock.ms).toBe(before);
});

test('the clamp is also what makes wall-clipping impossible', () => {
  // Movement relies on the same bound: speed x the longest possible frame
  // must stay under the avatar's radius, or a slow frame steps through a
  // wall. The two constraints are linked, so changing the clamp is not a
  // free decision.
  const maxStepTiles = AVATAR_SPEED_TILES_PER_SEC * MAX_FRAME_SECONDS;
  expect(maxStepTiles).toBeLessThan(AVATAR_RADIUS_TILES);
});

test('main.ts computes no frame delta of its own', () => {
  // If the loop went back to subtracting timestamps inline, the clamp would
  // be bypassed and nothing else here would notice.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  expect(main).toMatch(/tickSessionClock\(/);
  expect(main).not.toMatch(/lastTime/);
  expect(main).not.toMatch(/sessionMs\s*\+=/);
});

test('the session clock reads no wall clock', () => {
  const code = readSources().find((f) => f.path === 'engine/sessionClock.ts')!.code;
  expect(code).not.toMatch(/\bnew Date\b|\bDate\.now\b|performance\.now/);
});
