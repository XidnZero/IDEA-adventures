import type { World } from '../world/types';
import type { Avatar, Direction } from '../avatar/avatar';
import { tileCenterPx } from '../avatar/avatar';
import { TILE_PX } from '../engine/config';

/** Shared by both movement systems (drag-steer and auto-walk) — not a shared step loop, just these two utilities. */
export function pickFacing(dx: number, dy: number, current: Direction): Direction {
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return current;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

export function crossDoorIfOnDoor(world: World, avatar: Avatar): void {
  const room = world.rooms[avatar.roomId];
  const tx = Math.floor(avatar.x / TILE_PX);
  const ty = Math.floor(avatar.y / TILE_PX);
  const tile = room.grid[ty]?.[tx];
  if (tile?.kind !== 'door') return;

  const target = world.rooms[tile.door.to];
  const center = tileCenterPx(tile.door.spawn[0], tile.door.spawn[1]);
  avatar.roomId = target.id;
  avatar.x = center.x;
  avatar.y = center.y;
}
