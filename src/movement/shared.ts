import type { World } from '../world/types';
import type { Avatar, Direction } from '../avatar/avatar';
import { TILE_PX } from '../engine/config';
import { findRoomAtWorldTile } from '../world/worldGrid';

/** Shared by both movement systems (drag-steer and auto-walk) — not a shared step loop, just these two utilities. */
export function pickFacing(dx: number, dy: number, current: Direction): Direction {
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return current;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

// One full stride per this many pixels travelled. Roughly two steps per tile
// at TILE_PX 48, which reads as a walk rather than a scurry.
const PX_PER_STRIDE = TILE_PX;

/**
 * Advances the placeholder walk cycle by distance moved, shared by both
 * movement systems. Distance rather than time is deliberate: the gait then
 * matches whatever speed the avatar is actually going, stops dead when they
 * stop, and needs no clock of its own (R19 — see avatar.ts).
 */
export function advanceWalkPhase(avatar: Avatar, distancePx: number): void {
  if (distancePx <= 0) return;
  avatar.walkPhase = (avatar.walkPhase + (distancePx / PX_PER_STRIDE) * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Keeps `avatar.roomId` in sync with world position. Movement itself no
 * longer needs this (R1's composited house is one continuous walkable grid),
 * but room-scoped bookkeeping still does — need-bubble/tap-response bounce
 * keys and NPC lookups are keyed by (roomId, local tx, ty).
 */
export function updateAvatarRoomId(world: World, avatar: Avatar): void {
  const hit = findRoomAtWorldTile(world, Math.floor(avatar.x / TILE_PX), Math.floor(avatar.y / TILE_PX));
  if (hit) avatar.roomId = hit.room.id;
}
