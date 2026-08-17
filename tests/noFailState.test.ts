import { expect, test } from 'vitest';
import { advanceNeedState, createNeedState, resolveNeed } from '../src/needs/needState';
import { readSources } from './helpers/sourceScan';

/**
 * R14 — the negative test from phase-1.md's acceptance criteria: "no input
 * sequence produces distress/accident/unhappiness."
 *
 * A behavioural test can only ever sample the input space, so the load-bearing
 * assertions here are the structural ones: the reason no input sequence can
 * produce distress is that the codebase contains nothing that could represent
 * it. The simulation below backs that up over a long, adversarial session.
 */

// Vocabulary that would have to appear for a fail state to exist at all.
// Matched against comment-stripped code only (see helpers/sourceScan.ts) —
// the source discusses these concepts constantly in prose, which is fine;
// what matters is that none of them are ever a value, field, or branch.
const FAIL_STATE_VOCABULARY = [
  /\bdistress/i,
  /\bunhappy/i,
  /\bsad\b/i,
  /\baccident/i,
  /\bcrying\b|\bcries\b/i,
  /\bsick|\billness/i,
  /\bseverity\b/i,
  /\burgency\b|\burgent\b/i,
  /\bescalat/i,
  /\bgameOver\b|\bloseGame\b|\bfailState\b/i,
  /\bscore\b/i,
  /\bwrongAnswer\b|\bisWrong\b|\bisCorrect\b/i,
];

test('no module contains any fail-state concept', () => {
  const offenders: string[] = [];
  for (const file of readSources()) {
    for (const pattern of FAIL_STATE_VOCABULARY) {
      if (pattern.test(file.code)) offenders.push(`${file.path} matches ${pattern}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('need state carries no field that could encode how long a need went unmet', () => {
  const state = createNeedState(0);
  // If this list ever grows, the new field has to be justified against R14:
  // a counter that survives across need cycles is exactly how severity gets
  // introduced by accident.
  expect(Object.keys(state).sort()).toEqual([
    'active',
    'hygieneActivitySec',
    'nextNeedAtMs',
    'pendingWashroomAtMs',
  ]);
});

test('an ignored need never changes, no matter how long it is ignored', () => {
  const state = createNeedState(0);
  let sessionMs = 0;

  // Play until a need appears.
  while (state.active === null) {
    sessionMs += 100;
    advanceNeedState(state, sessionMs, 0.1, true);
  }
  const firstNeed = state.active;
  const atOnset = structuredClone(state);

  // Then ignore it for eight straight hours of foreground play, moving the
  // whole time (the input most likely to accumulate hidden state).
  for (let i = 0; i < 8 * 60 * 60 * 10; i++) {
    sessionMs += 100;
    advanceNeedState(state, sessionMs, 0.1, true);
  }

  expect(state.active).toBe(firstNeed);
  expect(state.nextNeedAtMs).toBe(atOnset.nextNeedAtMs);
  expect(state.pendingWashroomAtMs).toBe(atOnset.pendingWashroomAtMs);
  // hygieneActivitySec is the one field that grows — it's an activity
  // counter, not a need-severity counter. It must not feed back into the
  // currently active need in any way, which the assertions above cover.
});

test('a long randomized session only ever reaches known-good states', () => {
  // mulberry32 — deterministic (so a failure is reproducible) and, unlike a
  // naive LCG written in floating point, it stays inside 32-bit precision
  // instead of quietly collapsing to a constant.
  let seed = 20260817;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const seen = new Set<string>();
  const violations: string[] = [];

  // Four hours of play at 20fps per movement profile. The profiles matter:
  // hygiene is caused by accumulated movement and hunger only fires when
  // that threshold *hasn't* been reached, so a single profile exercises one
  // branch and never the other (see docs/decisions.md on the pacing note).
  for (const moveChance of [0, 0.15, 0.6, 1]) {
    const state = createNeedState(0);
    let sessionMs = 0;

    // Assertions are collected rather than made inside the loop; an expect()
    // per frame dominates the runtime by two orders of magnitude.
    for (let i = 0; i < 4 * 60 * 60 * 20; i++) {
      const dt = 0.05;
      sessionMs += dt * 1000;
      advanceNeedState(state, sessionMs, dt, rand() < moveChance);
      seen.add(String(state.active));

      // Resolutions are guarded the way main.ts guards them (auto-walk only
      // finishes when a need is active). A stray unguarded call is thrown in
      // rarely as well, since resolveNeed also re-rolls the pacing timer and
      // must survive being called with nothing active.
      if (state.active !== null && rand() < 0.01) resolveNeed(state, sessionMs);
      else if (rand() < 0.00002) resolveNeed(state, sessionMs);

      if (state.active !== null && !['hunger', 'washroom', 'hygiene'].includes(state.active)) {
        violations.push(`${moveChance}/frame ${i}: unknown need "${state.active}"`);
      }
      if (!(state.hygieneActivitySec >= 0) || !Number.isFinite(state.nextNeedAtMs)) {
        violations.push(`${moveChance}/frame ${i}: non-finite timer state`);
      }
    }
  }

  expect(violations).toEqual([]);
  // Sanity: the session was long and varied enough to actually exercise
  // every need, so the invariants above were tested against real coverage.
  expect([...seen].sort()).toEqual(['hunger', 'hygiene', 'null', 'washroom']);
});

test('resolving hunger causes a later washroom need, and never delays a pending one', () => {
  const state = createNeedState(0);
  state.active = 'hunger';
  resolveNeed(state, 0);
  const scheduled = state.pendingWashroomAtMs;
  expect(scheduled).toBeGreaterThan(0);

  // A second meal before the first chain fires must not push it further out.
  state.active = 'hunger';
  resolveNeed(state, 10_000);
  expect(state.pendingWashroomAtMs).toBe(scheduled);

  advanceNeedState(state, scheduled!, 0.05, false);
  expect(state.active).toBe('washroom');
  expect(state.pendingWashroomAtMs).toBeNull();
});

test('only one need is ever active at a time', () => {
  const state = createNeedState(0);
  state.active = 'hunger';
  state.pendingWashroomAtMs = 1000;

  // The causal washroom need is due, but hunger is unresolved — it waits.
  advanceNeedState(state, 5000, 0.05, true);
  expect(state.active).toBe('hunger');
  expect(state.pendingWashroomAtMs).toBe(1000);
});
