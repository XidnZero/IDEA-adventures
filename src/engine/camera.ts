import type { WorldBoundsPx } from '../world/worldGrid';

/**
 * Threshold-pan following camera (R1). All rooms in the house are composited
 * into one continuous scene (see world/worldGrid.ts) and rendered together —
 * there is no per-room hard cut. The camera itself only ever reacts to the
 * avatar's position: it holds still while the avatar is within a dead-zone
 * box around screen-center, and once the avatar crosses that threshold, eases
 * the view toward keeping the avatar just inside the zone again. It never
 * moves on its own, satisfying CLAUDE.md's "camera only moves when the
 * avatar moves" — a stationary avatar produces a stationary desired position,
 * so the ease has nothing to converge toward and the camera stays put.
 */
export interface CameraState {
  x: number; // world-px of the viewport's top-left corner
  y: number;
}

const DEADZONE_FRAC = 0.22; // half-width/height of the no-pan zone, as a fraction of viewport
const PAN_RATE = 5; // higher = camera catches up to the dead-zone edge faster

export function createCamera(
  centerPxX: number,
  centerPxY: number,
  viewportW: number,
  viewportH: number,
): CameraState {
  return { x: centerPxX - viewportW / 2, y: centerPxY - viewportH / 2 };
}

export function updateCamera(
  camera: CameraState,
  avatarPxX: number,
  avatarPxY: number,
  viewportW: number,
  viewportH: number,
  bounds: WorldBoundsPx,
  dtSeconds: number,
): void {
  const deadX = viewportW * DEADZONE_FRAC;
  const deadY = viewportH * DEADZONE_FRAC;

  const screenX = avatarPxX - camera.x;
  const screenY = avatarPxY - camera.y;

  let desiredX = camera.x;
  let desiredY = camera.y;
  if (screenX < viewportW / 2 - deadX) desiredX = avatarPxX - (viewportW / 2 - deadX);
  else if (screenX > viewportW / 2 + deadX) desiredX = avatarPxX - (viewportW / 2 + deadX);
  if (screenY < viewportH / 2 - deadY) desiredY = avatarPxY - (viewportH / 2 - deadY);
  else if (screenY > viewportH / 2 + deadY) desiredY = avatarPxY - (viewportH / 2 + deadY);

  // Framerate-independent ease toward the desired position, not an instant snap.
  const t = 1 - Math.exp(-PAN_RATE * dtSeconds);
  camera.x += (desiredX - camera.x) * t;
  camera.y += (desiredY - camera.y) * t;

  // Clamp to the composited house's outer bounds. If the whole house is
  // smaller than the viewport on an axis, center it instead of clamping to a
  // backwards range.
  const worldW = bounds.maxX - bounds.minX;
  const worldH = bounds.maxY - bounds.minY;
  if (worldW <= viewportW) {
    camera.x = bounds.minX + (worldW - viewportW) / 2;
  } else {
    camera.x = Math.max(bounds.minX, Math.min(camera.x, bounds.maxX - viewportW));
  }
  if (worldH <= viewportH) {
    camera.y = bounds.minY + (worldH - viewportH) / 2;
  } else {
    camera.y = Math.max(bounds.minY, Math.min(camera.y, bounds.maxY - viewportH));
  }
}
