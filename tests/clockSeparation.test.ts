import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { getLightingState } from '../src/engine/dayNight';
import { advanceNeedState, createNeedState } from '../src/needs/needState';
import { filesMatching, readSources } from './helpers/sourceScan';

/**
 * R19 — clock separation, the hard wall from CLAUDE.md: "Day/night reads the
 * device clock. Needs read foreground-only play time. These two clocks must
 * never touch the same variable."
 *
 * phase-1.md's build order asks for this specifically: "Verify with a test
 * that need-timer and lighting-timer are structurally separate variables."
 * It was previously verified only by throwaway Playwright scripts, so it
 * stopped being verified the moment those were deleted. This file is that
 * verification, checked in and re-run on every change.
 */

const WALL_CLOCK = /\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test('only dayNight.ts reads the device wall clock', () => {
  // performance.now() is included in WALL_CLOCK deliberately: main.ts uses it
  // for the render loop and for animation timestamps, which is fine, but it
  // must never be the thing that advances need state — hence the separate
  // assertion below that needState.ts reads no clock of any kind.
  expect(filesMatching(WALL_CLOCK).filter((p) => p !== 'main.ts')).toEqual([
    'engine/dayNight.ts',
  ]);
});

test('the needs module reads no clock at all — session time only ever arrives as an argument', () => {
  const needState = readSources().find((f) => f.path === 'needs/needState.ts')!;
  expect(needState.code).not.toMatch(WALL_CLOCK);
  expect(needState.code).not.toMatch(/dayNight|getLightingState|isNight|lighting/);
});

test('the two clock modules never import each other', () => {
  const byPath = new Map(readSources().map((f) => [f.path, f.code]));
  expect(byPath.get('engine/dayNight.ts')).not.toMatch(/needState|sessionMs|\bNeed\b/);
  expect(byPath.get('needs/needState.ts')).not.toMatch(/engine\/dayNight/);
});

test('main.ts keeps them in two separate variables', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  // sessionMs accumulates rAF deltas; lighting is reassigned from a fresh
  // getLightingState() call. Neither expression may mention the other.
  const sessionMsAssignments = [...main.matchAll(/sessionMs\s*(?:\+=|=)([^;]*);/g)].map((m) => m[1]);
  expect(sessionMsAssignments.length).toBeGreaterThan(0);
  for (const rhs of sessionMsAssignments) {
    expect(rhs).not.toMatch(/lighting|Date|getLightingState/);
  }

  const lightingAssignments = [...main.matchAll(/lighting\s*(?:\+=|=)([^;]*);/g)].map((m) => m[1]);
  expect(lightingAssignments.length).toBeGreaterThan(0);
  for (const rhs of lightingAssignments) {
    expect(rhs).not.toMatch(/sessionMs|dt\b/);
  }
});

test('a full day of device-clock movement cannot advance need state', () => {
  const state = createNeedState(0);
  const snapshot = structuredClone(state);

  // The device clock sweeps a whole day, in both a "night" and a "day"
  // window, while zero foreground play time elapses (sessionMs stays 0).
  for (let hour = 0; hour < 24; hour++) {
    vi.setSystemTime(new Date(2026, 0, 1, hour, 30, 0));
    advanceNeedState(state, 0, 0, false);
  }

  expect(state).toEqual(snapshot);
});

test('a long session of play time cannot change the lighting', () => {
  vi.setSystemTime(new Date(2026, 0, 1, 13, 0, 0));
  const atStart = getLightingState();

  // Two hours of foreground play, enough to cycle needs several times over.
  const state = createNeedState(0);
  let sessionMs = 0;
  for (let i = 0; i < 7200; i++) {
    sessionMs += 1000;
    advanceNeedState(state, sessionMs, 1, true);
  }

  expect(sessionMs).toBe(7_200_000);
  expect(state.active).not.toBeNull(); // the need clock really did run
  expect(getLightingState()).toEqual(atStart); // the lighting clock did not
});

test('getLightingState is a pure function of the date it is handed', () => {
  const twoAm = new Date(2026, 0, 1, 2, 0, 0);
  const twoPm = new Date(2026, 0, 1, 14, 0, 0);

  // Same argument, wildly different system times => identical result.
  vi.setSystemTime(new Date(2026, 5, 9, 8, 0, 0));
  const a = getLightingState(twoAm);
  vi.setSystemTime(new Date(2031, 11, 25, 23, 59, 0));
  const b = getLightingState(twoAm);
  expect(a).toEqual(b);

  expect(a.isNight).toBe(true);
  expect(getLightingState(twoPm).isNight).toBe(false);
});
