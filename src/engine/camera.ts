/**
 * Following camera (R1): centers on the avatar, clamped to room bounds.
 * No independent motion of any kind — it only ever recomputes from the
 * avatar's current position, never drifts or scrolls on its own.
 */
export function computeCameraOffset(
  avatarPxX: number,
  avatarPxY: number,
  roomPxW: number,
  roomPxH: number,
  viewportW: number,
  viewportH: number,
): { x: number; y: number } {
  let x = avatarPxX - viewportW / 2;
  let y = avatarPxY - viewportH / 2;

  // Clamp so we never show past the room edge. If the room is smaller than
  // the viewport on an axis, center it instead of clamping to a backwards range.
  if (roomPxW <= viewportW) {
    x = (roomPxW - viewportW) / 2;
  } else {
    x = Math.max(0, Math.min(x, roomPxW - viewportW));
  }
  if (roomPxH <= viewportH) {
    y = (roomPxH - viewportH) / 2;
  } else {
    y = Math.max(0, Math.min(y, roomPxH - viewportH));
  }

  return { x, y };
}
