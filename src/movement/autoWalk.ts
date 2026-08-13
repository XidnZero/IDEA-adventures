import type { World } from '../world/types';
import type { Avatar } from '../avatar/avatar';
import { tileCenterPx } from '../avatar/avatar';
import { AVATAR_SPEED_TILES_PER_SEC, TILE_PX } from '../engine/config';
import { pickFacing } from './shared';
import type { PathNode } from './bfsPath';

/**
 * Waypoint auto-walk (R9): follows a precomputed BFS path one tile at a
 * time. This is the need-bubble auto-walk system, kept deliberately separate
 * from dragSteer.ts's continuous pointer-follow (docs/decisions.md).
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

export function stepAutoWalk(world: World, avatar: Avatar, state: AutoWalkState, dtSeconds: number): void {
  if (isAutoWalkDone(state)) return;
  const node = state.path[state.stepIndex];

  // Should stay in sync by construction (see the door-crossing branch
  // below), but if it ever doesn't, skip forward rather than getting stuck
  // forever on a node in a room the avatar has already left.
  if (node.roomId !== avatar.roomId) {
    state.stepIndex++;
    return;
  }

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

  // If the tile just reached is a door, the *next* path node is the paired
  // spawn tile in another room (bfsPath.ts's door edge) — jump straight
  // there instead of waiting for the avatar's raw grid position to cross
  // into the door's cell, which can happen mid-step, before this dist<2
  // threshold, and desync the path index from the avatar's actual room.
  const room = world.rooms[avatar.roomId];
  const tile = room.grid[node.ty]?.[node.tx];
  if (tile?.kind === 'door') {
    const next = state.path[state.stepIndex];
    if (next && next.roomId === tile.door.to) {
      const spawnCenter = tileCenterPx(next.tx, next.ty);
      avatar.roomId = next.roomId;
      avatar.x = spawnCenter.x;
      avatar.y = spawnCenter.y;
      state.stepIndex++;
    }
  }
}
