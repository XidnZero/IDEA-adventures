import { expect, test } from 'vitest';
import { hitTestProfileSwitcher } from '../src/ui/profileSwitcher';
import {
  GATE_HOLD_MS,
  GATE_JITTER_PX,
  GATE_ZONE_PX,
  inGateZone,
} from '../src/ui/parentGate';
import { createAvatar, AVATAR_PROFILES } from '../src/avatar/avatar';
import { EXIT_RADIUS } from '../src/minigame/toyboxSort';
import { readSources } from './helpers/sourceScan';

/**
 * R6 (profile switching) and R20 (parent gate) — the last two R-items with no
 * tests. Both are about touch surfaces on a screen shared with a 2-3 year
 * old: one has to be easy to hit, the other has to be almost impossible to
 * hit by accident, and they must not collide with each other or with the
 * mini-game's exit.
 */

const avatars = AVATAR_PROFILES.map((p, i) => createAvatar(p, 'living', 100 + i * 40, 100));

test('both portraits are hittable and meet the touch-target rule', () => {
  // CLAUDE.md: minimum touch target ~120px.
  const centres: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < avatars.length; i++) {
    // Find this portrait's extent by scanning the top-left region.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let x = 0; x < 400; x += 2) {
      for (let y = 0; y < 300; y += 2) {
        if (hitTestProfileSwitcher(avatars, x, y) === i) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    expect(maxX - minX, `portrait ${i} is too narrow`).toBeGreaterThanOrEqual(110);
    expect(maxY - minY, `portrait ${i} is too short`).toBeGreaterThanOrEqual(110);
    centres.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  }

  // They are distinct targets, not overlapping ones.
  expect(hitTestProfileSwitcher(avatars, centres[0].x, centres[0].y)).toBe(0);
  expect(hitTestProfileSwitcher(avatars, centres[1].x, centres[1].y)).toBe(1);
  expect(Math.abs(centres[0].x - centres[1].x)).toBeGreaterThan(110);
});

test('taps away from the portraits fall through to the world', () => {
  expect(hitTestProfileSwitcher(avatars, 700, 500)).toBeNull();
  expect(hitTestProfileSwitcher(avatars, 20, 400)).toBeNull();
  expect(hitTestProfileSwitcher(avatars, 600, 40)).toBeNull();
});

test('switching profiles never touches world state', () => {
  // R6: "Shared world state, no reset on switch." The switch branch may
  // change who is active and drop the current drag, and nothing else — no
  // repositioning, no need reset, no auto-walk cancellation for the avatar
  // being left behind.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const start = main.indexOf('hitTestProfileSwitcher(avatars');
  const branch = main.slice(start, main.indexOf('return;', start));

  expect(branch).toMatch(/activeIndex = picked/);
  for (const forbidden of [/createAvatar/, /createNeedState/, /needStates\[/, /\.x =/, /\.y =/, /autoWalkStates\[/]) {
    expect(branch, `switch branch touches ${forbidden}`).not.toMatch(forbidden);
  }
});

test('both avatars exist and are stepped from the first frame', () => {
  // The other child is not spawned on demand — they are in the world the
  // whole time, which is what makes "no reset on switch" meaningful.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  expect(main).toMatch(/AVATAR_PROFILES\.map\(/);
  expect(main).toMatch(/for \(let i = 0; i < avatars\.length; i\+\+\)/);
  expect(avatars).toHaveLength(2);
});

test('the gate zone is only the bottom-right corner', () => {
  const w = 1000;
  const h = 800;
  expect(inGateZone(w - 1, h - 1, w, h)).toBe(true);
  expect(inGateZone(w - GATE_ZONE_PX, h - GATE_ZONE_PX, w, h)).toBe(true);
  expect(inGateZone(w - GATE_ZONE_PX - 1, h - 1, w, h)).toBe(false);
  expect(inGateZone(w - 1, h - GATE_ZONE_PX - 1, w, h)).toBe(false);
  expect(inGateZone(w / 2, h / 2, w, h)).toBe(false);
  expect(inGateZone(0, 0, w, h)).toBe(false);
});

test('the gate never overlaps the other two touch surfaces', () => {
  // Profile portraits live top-left, the mini-game exit top-right. A gate
  // that shared pixels with either would be both discoverable and disruptive.
  const w = 1000;
  const h = 800;
  for (let x = 0; x < w; x += 5) {
    for (let y = 0; y < h; y += 5) {
      if (!inGateZone(x, y, w, h)) continue;
      expect(hitTestProfileSwitcher(avatars, x, y), `gate overlaps a portrait at ${x},${y}`).toBeNull();
      // Mini-game exit centre is (w - 24 - 64, 24 + 64).
      const dist = Math.hypot(x - (w - 24 - EXIT_RADIUS), y - (24 + EXIT_RADIUS));
      expect(dist, `gate overlaps the mini-game exit at ${x},${y}`).toBeGreaterThan(EXIT_RADIUS);
    }
  }
});

test('the gate gesture is deliberately hard for a toddler to produce', () => {
  // A sustained, motionless press is close to the opposite of how this age
  // group touches a screen (whole-hand taps and drags, CLAUDE.md).
  expect(GATE_HOLD_MS).toBeGreaterThanOrEqual(3000);
  expect(GATE_JITTER_PX).toBeLessThanOrEqual(32);
  expect(GATE_JITTER_PX).toBeGreaterThan(0); // some tolerance, or a real adult can't hold it either
});

test('the gate is a side-channel: it never pre-empts normal play', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const handlerStart = main.indexOf("addEventListener('pointerdown'");
  const handler = main.slice(handlerStart, main.indexOf("addEventListener('pointermove'"));

  // Starting a hold must not return early — a tap in that corner still does
  // whatever it would do anywhere else.
  const zoneCheck = handler.indexOf('inGateZone(');
  expect(zoneCheck).toBeGreaterThan(-1);
  const afterZone = handler.slice(zoneCheck, handler.indexOf('if (gateOpen)'));
  expect(afterZone).not.toMatch(/\breturn\b/);

  // Movement and release both cancel it.
  expect(main).toMatch(/GATE_JITTER_PX[\s\S]{0,80}gateHold = null/);
  expect(main).toMatch(/function releaseDrag[\s\S]{0,300}gateHold = null/);

  // And it is disabled entirely while the mini-game owns input.
  expect(handler).toMatch(/!miniGame && !gateOpen && inGateZone\(/);
});

test('the gate opens only from the frame loop, after the full hold', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const opens = [...main.matchAll(/gateOpen = true/g)];
  expect(opens).toHaveLength(1);
  const context = main.slice(Math.max(0, opens[0].index! - 220), opens[0].index!);
  expect(context).toMatch(/GATE_HOLD_MS/);
});
