import { afterEach, expect, test, vi } from 'vitest';
import { createAvatar, AVATAR_PROFILES, type Avatar } from '../src/avatar/avatar';
import { advanceWalkPhase } from '../src/movement/shared';
import { createFakeCtx, installFakeImage } from './helpers/fakeCanvas';
import { readSources } from './helpers/sourceScan';

/**
 * R5 — the walk half of "4-direction walk + idle". Facing already worked, but
 * `pose` only ever selected an asset path, so with no real art the avatar
 * slid around as a static puck, and `main.ts` derived the pose from whether a
 * drag was held — meaning an auto-walking avatar (R9) rendered as idle while
 * it was visibly moving.
 */

let restoreImage: (() => void) | null = null;
afterEach(() => {
  restoreImage?.();
  restoreImage = null;
});

function avatarAt(phase: number): Avatar {
  const a = createAvatar(AVATAR_PROFILES[0], 'living', 500, 500);
  a.walkPhase = phase;
  return a;
}

async function freshRenderAvatar() {
  vi.resetModules(); // assets.ts caches per-name; each test needs a clean cache
  return (await import('../src/render/renderAvatar')).renderAvatar;
}

test('the stride is driven by distance travelled, not by elapsed time', () => {
  const avatar = avatarAt(0);

  // Same total distance, delivered in one step or in many, lands in the
  // same place — so the gait matches the avatar's real speed and cannot
  // drift with frame rate.
  advanceWalkPhase(avatar, 24);
  const oneStep = avatar.walkPhase;

  const other = avatarAt(0);
  for (let i = 0; i < 24; i++) advanceWalkPhase(other, 1);
  expect(other.walkPhase).toBeCloseTo(oneStep, 6);
});

test('standing still freezes the stride', () => {
  const avatar = avatarAt(1.234);
  advanceWalkPhase(avatar, 0);
  advanceWalkPhase(avatar, -5); // never rewind, even on a bogus negative delta
  expect(avatar.walkPhase).toBe(1.234);
});

test('the stride stays bounded however far the avatar walks', () => {
  const avatar = avatarAt(0);
  for (let i = 0; i < 10_000; i++) advanceWalkPhase(avatar, 37);
  expect(avatar.walkPhase).toBeGreaterThanOrEqual(0);
  expect(avatar.walkPhase).toBeLessThan(Math.PI * 2);
});

test('a walking avatar renders differently from a standing one', async () => {
  restoreImage = installFakeImage(() => false); // placeholder art only
  const renderAvatar = await freshRenderAvatar();

  const idle = createFakeCtx();
  renderAvatar(idle.ctx, avatarAt(Math.PI / 2), 'idle');

  const walking = createFakeCtx();
  renderAvatar(walking.ctx, avatarAt(Math.PI / 2), 'walk');

  expect(walking.calls).not.toEqual(idle.calls);
});

test('mid-stride the two feet are not in the same place', async () => {
  restoreImage = installFakeImage(() => false);
  const renderAvatar = await freshRenderAvatar();

  const fake = createFakeCtx();
  renderAvatar(fake.ctx, avatarAt(Math.PI / 2), 'walk');

  // The first two arcs are the feet — they're drawn before the body layers
  // so they tuck underneath.
  const arcs = fake.calls.filter((c) => c.method === 'arc');
  const [left, right] = arcs;
  expect(arcs.length).toBeGreaterThanOrEqual(3);
  expect([left.args[0], left.args[1]]).not.toEqual([right.args[0], right.args[1]]);
});

test('at the top of the stride, walking and standing agree', async () => {
  restoreImage = installFakeImage(() => false);
  const renderAvatar = await freshRenderAvatar();

  // phase 0 is the neutral point of the cycle: no swing, no bob. Walking and
  // idle must produce identical output there, which is what keeps the
  // animation from popping the moment the avatar starts or stops moving.
  const idle = createFakeCtx();
  renderAvatar(idle.ctx, avatarAt(0), 'idle');
  const walking = createFakeCtx();
  renderAvatar(walking.ctx, avatarAt(0), 'walk');

  expect(walking.calls).toEqual(idle.calls);
});

test('real art suppresses the placeholder stride entirely', async () => {
  restoreImage = installFakeImage(() => true); // every layer has authored art
  const renderAvatar = await freshRenderAvatar();

  // Prime the asset cache: the first request always returns null while the
  // load is in flight, exactly as it does in the browser. Both poses need
  // priming — the asset path includes the pose, so they're separate entries.
  renderAvatar(createFakeCtx().ctx, avatarAt(Math.PI / 2), 'walk');
  renderAvatar(createFakeCtx().ctx, avatarAt(Math.PI / 2), 'idle');

  const walking = createFakeCtx();
  renderAvatar(walking.ctx, avatarAt(Math.PI / 2), 'walk');
  const idle = createFakeCtx();
  renderAvatar(idle.ctx, avatarAt(Math.PI / 2), 'idle');

  // A real walk sprite animates itself; bobbing it too would fight its own
  // cycle. Both render as one drawImage per layer plus the facing dot —
  // no code-drawn feet, no placeholder body/hair/clothing circles.
  expect(walking.count('drawImage')).toBe(3);
  expect(idle.count('drawImage')).toBe(3);
  expect(walking.count('arc')).toBe(1);
  expect(idle.count('arc')).toBe(1);
});

test('pose follows actual movement, not whether a drag is held', () => {
  const main = readSources().find((f) => f.path === 'main.ts')!.code;

  // The old form keyed off drag.active, which is false during a need-bubble
  // auto-walk even though the avatar is plainly walking.
  expect(main).not.toMatch(/drag\.active\s*\?\s*'walk'/);
  expect(main).toMatch(/poses\[i\]\s*=\s*isMoving\s*\?\s*'walk'\s*:\s*'idle'/);

  // Both movement systems feed the same distance measurement, so the stride
  // and the pose can never disagree about whether the avatar moved.
  expect(main).toMatch(/advanceWalkPhase\(avatar, movedPx\)/);
});

test('portraits never animate', () => {
  // The HUD portrait shares the layered draw but must stay a still image —
  // a bobbing portrait would read as a second thing happening on screen.
  const switcher = readSources().find((f) => f.path === 'ui/profileSwitcher.ts')!.code;
  expect(switcher).toMatch(/drawLayeredAvatar\(ctx, avatar, 'idle', 'down'/);
  expect(switcher).not.toMatch(/walkPhase|renderAvatar\(/);
});
