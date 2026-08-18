import type { World } from '../world/types';
import type { Avatar } from '../avatar/avatar';
import { AVATAR_RADIUS_TILES, AVATAR_SPEED_TILES_PER_SEC, TILE_PX } from '../engine/config';
import { pickFacing } from './shared';
import { isWalkableWorldTile } from '../world/worldGrid';

/**
 * Hold-and-drag world movement (R8). Continuous pointer-following, not
 * single-tap-to-point. This is a deliberately separate code path from the
 * BFS waypoint auto-walk in autoWalk.ts — the Phase 0 spike hit stutter bugs
 * when the two were mixed (recomputing a path every pointer-move fought the
 * avatar's current step). See docs/decisions.md.
 */
export interface DragState {
  active: boolean;
  targetPxX: number;
  targetPxY: number;
  // Which pointer owns this drag. A 2-3 year old presses with a whole hand
  // (observed in the Phase 0 spike, see CLAUDE.md), which produces several
  // pointers at once; without an owner, a second finger landing steals the
  // steering and a second finger lifting cancels the walk while the first is
  // still pressed down.
  pointerId: number | null;
}

export function createDragState(): DragState {
  return { active: false, targetPxX: 0, targetPxY: 0, pointerId: null };
}
/**
 * Pointer ownership. A 2-3 year old presses with a whole hand (observed in
 * the Phase 0 spike, CLAUDE.md), so several pointers arrive at once and leave
 * in an arbitrary order. Without an owner, a second finger landing stole the
 * steering and a second finger *lifting* cancelled the walk while the first
 * was still pressed — the avatar stopped dead under a hand still on screen.
 *
 * These live here rather than inline in main.ts's event handler because they
 * are rules about the drag's own state, and in a handler they were neither
 * testable nor obviously a set that has to agree with itself.
 */

/** Claims the drag for this pointer. Returns false if another one owns it. */
export function beginDrag(
  drag: DragState,
  pointerId: number,
  targetPxX: number,
  targetPxY: number,
): boolean {
  if (drag.active && drag.pointerId !== null && drag.pointerId !== pointerId) return false;
  drag.active = true;
  drag.pointerId = pointerId;
  drag.targetPxX = targetPxX;
  drag.targetPxY = targetPxY;
  return true;
}

/** Steers, but only for the pointer that owns the drag. */
export function updateDragTarget(
  drag: DragState,
  pointerId: number,
  targetPxX: number,
  targetPxY: number,
): void {
  if (!drag.active) return;
  if (drag.pointerId !== null && drag.pointerId !== pointerId) return;
  drag.targetPxX = targetPxX;
  drag.targetPxY = targetPxY;
}

/** Ends the drag, but only for the pointer that started it. */
export function endDrag(drag: DragState, pointerId: number): void {
  if (drag.pointerId !== null && drag.pointerId !== pointerId) return;
  drag.active = false;
  drag.pointerId = null;
}


function isWalkablePx(world: World, px: number, py: number): boolean {
  return isWalkableWorldTile(world, Math.floor(px / TILE_PX), Math.floor(py / TILE_PX));
}

// Avatar is treated as a small circle: check the 4 cardinal edge points so it
// can't clip through a wall corner-first while sliding along it.
function avatarFits(world: World, cx: number, cy: number): boolean {
  const r = AVATAR_RADIUS_TILES * TILE_PX;
  return (
    isWalkablePx(world, cx - r, cy) &&
    isWalkablePx(world, cx + r, cy) &&
    isWalkablePx(world, cx, cy - r) &&
    isWalkablePx(world, cx, cy + r)
  );
}

export function stepDragSteer(world: World, avatar: Avatar, drag: DragState, dtSeconds: number): void {
  if (!drag.active) return;

  const dx = drag.targetPxX - avatar.x;
  const dy = drag.targetPxY - avatar.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;

  const maxStep = AVATAR_SPEED_TILES_PER_SEC * TILE_PX * dtSeconds;
  const step = Math.min(maxStep, dist);
  const moveX = (dx / dist) * step;
  const moveY = (dy / dist) * step;

  // Axis-separated sliding: try x, then y, independently, so brushing a wall
  // at an angle slides along it instead of stopping dead.
  if (moveX !== 0 && avatarFits(world, avatar.x + moveX, avatar.y)) {
    avatar.x += moveX;
  }
  if (moveY !== 0 && avatarFits(world, avatar.x, avatar.y + moveY)) {
    avatar.y += moveY;
  }

  avatar.facing = pickFacing(dx, dy, avatar.facing);
}
