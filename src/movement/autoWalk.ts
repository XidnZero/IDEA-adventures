import type { Avatar } from '../avatar/avatar';
import { tileCenterPx } from '../avatar/avatar';
import { AVATAR_SPEED_TILES_PER_SEC, TILE_PX } from '../engine/config';
import { pickFacing } from './shared';
import type { PathNode } from './bfsPath';

/**
 * Waypoint auto-walk (R9): follows a precomputed BFS path one tile at a
 * time, in world-tile coordinates (R1's composited house). This is the
 * need-bubble auto-walk system, kept deliberately separate from
 * dragSteer.ts's continuous pointer-follow (docs/decisions.md).
 */
export interface AutoWalkState {
  path: PathNode[];
  stepIndex: number;
}

export function startAutoWalk(path: PathNode[]): AutoWalkState {
  return { path, stepIndex: 0 };
}

export function isAutoWalkDone(state: AutoWalkState): boolean {
  return state.stepIndex >= state.path.length;
}

export function stepAutoWalk(avatar: Avatar, state: AutoWalkState, dtSeconds: number): void {
  if (isAutoWalkDone(state)) return;
  const node = state.path[state.stepIndex];

  const target = tileCenterPx(node.tx, node.ty);
  const dx = target.x - avatar.x;
  const dy = target.y - avatar.y;
  const dist = Math.hypot(dx, dy);

  if (dist >= 2) {
    const maxStep = AVATAR_SPEED_TILES_PER_SEC * TILE_PX * dtSeconds;
    const step = Math.min(maxStep, dist);
    avatar.x += (dx / dist) * step;
    avatar.y += (dy / dist) * step;
    avatar.facing = pickFacing(dx, dy, avatar.facing);
    return;
  }

  state.stepIndex++;
}
