import { expect, test } from 'vitest';
import { createCamera, updateCamera, type CameraState } from '../src/engine/camera';
import { getWorldBoundsPx } from '../src/world/worldGrid';
import { loadWorld } from '../src/world/loadWorld';
import { readSources } from './helpers/sourceScan';

/**
 * R1 — the camera rules are hard prohibitions in CLAUDE.md ("No parallax /
 * camera drift / background scroll. Camera only moves when the avatar
 * moves."), and had no test at all. They're easy to break subtly: an ease
 * that never quite converges reads as drift, and anything time-driven reads
 * as parallax.
 */

const VIEW_W = 1200;
const VIEW_H = 800;
const world = loadWorld();
const bounds = getWorldBoundsPx(world);

// Well inside the house on both axes, so clamping isn't what's being tested.
const MID_X = (bounds.minX + bounds.maxX) / 2;
const MID_Y = (bounds.minY + bounds.maxY) / 2;

function cameraOn(x: number, y: number): CameraState {
  const camera = createCamera(x, y, VIEW_W, VIEW_H);
  // One settle step so the constructor's raw centring is already clamped.
  updateCamera(camera, x, y, VIEW_W, VIEW_H, bounds, 0.016);
  return camera;
}

test('a still avatar never moves the camera, however long you wait', () => {
  const camera = cameraOn(MID_X, MID_Y);
  const start = { ...camera };

  // Ten seconds of frames with the avatar frozen. Drift would accumulate here.
  for (let i = 0; i < 600; i++) {
    updateCamera(camera, MID_X, MID_Y, VIEW_W, VIEW_H, bounds, 1 / 60);
  }
  expect(camera.x).toBe(start.x);
  expect(camera.y).toBe(start.y);
});

test('small avatar movement inside the dead zone still does not move the camera', () => {
  const camera = cameraOn(MID_X, MID_Y);
  const start = { ...camera };

  // The dead zone is 22% of the viewport either side of centre; stay inside it.
  const insideX = VIEW_W * 0.2;
  const insideY = VIEW_H * 0.2;
  for (let i = 0; i < 120; i++) {
    const t = i / 120;
    updateCamera(
      camera,
      MID_X + Math.sin(t * 6) * insideX,
      MID_Y + Math.cos(t * 6) * insideY,
      VIEW_W,
      VIEW_H,
      bounds,
      1 / 60,
    );
  }
  expect(camera.x).toBe(start.x);
  expect(camera.y).toBe(start.y);
});

test('crossing the dead-zone edge does move the camera, and it settles', () => {
  const camera = cameraOn(MID_X, MID_Y);
  const start = { ...camera };

  const farX = MID_X + VIEW_W * 0.45; // past the 22% dead zone
  for (let i = 0; i < 300; i++) {
    updateCamera(camera, farX, MID_Y, VIEW_W, VIEW_H, bounds, 1 / 60);
  }
  expect(camera.x).toBeGreaterThan(start.x);
  expect(camera.y).toBe(start.y); // the untouched axis stays untouched

  // The pan is an exponential ease, so it approaches its target
  // asymptotically rather than landing on it — after settling, each further
  // frame moves by a vanishing fraction of a pixel. That is not drift: drift
  // is movement with nothing driving it, and it's the *stationary avatar*
  // case above that has to be exactly still. It is: a still avatar yields
  // desired === current, so nothing is added at all.
  const settled = camera.x;
  updateCamera(camera, farX, MID_Y, VIEW_W, VIEW_H, bounds, 1 / 60);
  expect(Math.abs(camera.x - settled)).toBeLessThan(0.001);
});

test('panning is framerate-independent', () => {
  // The same elapsed time must land in the same place whether it arrives as
  // one long frame or many short ones, or the camera speed becomes a
  // function of device performance.
  const target = MID_X + VIEW_W * 0.45;

  const coarse = cameraOn(MID_X, MID_Y);
  for (let i = 0; i < 10; i++) updateCamera(coarse, target, MID_Y, VIEW_W, VIEW_H, bounds, 0.05);

  const fine = cameraOn(MID_X, MID_Y);
  for (let i = 0; i < 50; i++) updateCamera(fine, target, MID_Y, VIEW_W, VIEW_H, bounds, 0.01);

  expect(coarse.x).toBeCloseTo(fine.x, 0);
});

test('the camera never shows anything outside the house', () => {
  // Walk the avatar to each extreme corner of the world and check the
  // viewport stays inside the composited bounds.
  const corners = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.maxY],
  ];
  for (const [ax, ay] of corners) {
    const camera = cameraOn(MID_X, MID_Y);
    for (let i = 0; i < 600; i++) {
      updateCamera(camera, ax, ay, VIEW_W, VIEW_H, bounds, 1 / 60);
    }
    expect(camera.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(camera.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(camera.x + VIEW_W).toBeLessThanOrEqual(bounds.maxX);
    expect(camera.y + VIEW_H).toBeLessThanOrEqual(bounds.maxY);
  }
});

test('a house smaller than the viewport is centred, not clamped backwards', () => {
  const tiny = { minX: 0, minY: 0, maxX: 400, maxY: 300 };
  const camera = createCamera(200, 150, VIEW_W, VIEW_H);
  updateCamera(camera, 200, 150, VIEW_W, VIEW_H, tiny, 1 / 60);
  expect(camera.x).toBe((400 - VIEW_W) / 2);
  expect(camera.y).toBe((300 - VIEW_H) / 2);
});

test('the camera reads nothing but the avatar', () => {
  // Parallax and background scroll both come from the camera taking input it
  // has no business taking. Its only moving input is the avatar position.
  const code = readSources().find((f) => f.path === 'engine/camera.ts')!.code;
  expect(code).not.toMatch(/Date|performance\.now|sessionMs|lighting|Math\.random/);
});
