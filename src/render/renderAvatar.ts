import type { Avatar } from '../avatar/avatar';
import { AVATAR_RADIUS_TILES, TILE_PX } from '../engine/config';
import { requestAsset } from '../engine/assets';

const FACING_OFFSET: Record<Avatar['facing'], [number, number]> = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export function renderAvatar(ctx: CanvasRenderingContext2D, avatar: Avatar): void {
  const r = AVATAR_RADIUS_TILES * TILE_PX;

  const asset = requestAsset(`avatar-${avatar.id}`);
  if (asset) {
    ctx.drawImage(asset, avatar.x - r, avatar.y - r, r * 2, r * 2);
    return;
  }

  ctx.beginPath();
  ctx.arc(avatar.x, avatar.y, r, 0, Math.PI * 2);
  ctx.fillStyle = avatar.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Facing dot stands in for R5's directional sprite poses, not yet built.
  const [ox, oy] = FACING_OFFSET[avatar.facing];
  ctx.beginPath();
  ctx.arc(avatar.x + ox * r * 0.5, avatar.y + oy * r * 0.5, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}
