import type { RoomDef, World } from '../world/types';
import type { Avatar } from '../avatar/avatar';
import { AVATAR_RADIUS_TILES, AVATAR_SPEED_TILES_PER_SEC, TILE_PX } from '../engine/config';
import { crossDoorIfOnDoor, pickFacing } from './shared';

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
}

export function createDragState(): DragState {
  return { active: false, targetPxX: 0, targetPxY: 0 };
}

function isWalkablePx(room: RoomDef, px: number, py: number): boolean {
  const tx = Math.floor(px / TILE_PX);
  const ty = Math.floor(py / TILE_PX);
  if (ty < 0 || ty >= room.height || tx < 0 || tx >= room.width) return false;
  return room.walkable[ty][tx];
}

// Avatar is treated as a small circle: check the 4 cardinal edge points so it
// can't clip through a wall corner-first while sliding along it.
function avatarFits(room: RoomDef, cx: number, cy: number): boolean {
  const r = AVATAR_RADIUS_TILES * TILE_PX;
  return (
    isWalkablePx(room, cx - r, cy) &&
    isWalkablePx(room, cx + r, cy) &&
    isWalkablePx(room, cx, cy - r) &&
    isWalkablePx(room, cx, cy + r)
  );
}

export function stepDragSteer(world: World, avatar: Avatar, drag: DragState, dtSeconds: number): void {
  if (!drag.active) return;
  const room = world.rooms[avatar.roomId];

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
  if (moveX !== 0 && avatarFits(room, avatar.x + moveX, avatar.y)) {
    avatar.x += moveX;
  }
  if (moveY !== 0 && avatarFits(room, avatar.x, avatar.y + moveY)) {
    avatar.y += moveY;
  }

  avatar.facing = pickFacing(dx, dy, avatar.facing);

  crossDoorIfOnDoor(world, avatar);
}
