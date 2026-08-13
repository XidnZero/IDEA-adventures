import type { Avatar, Direction } from '../avatar/avatar';
import type { AvatarPalette, Layer, Pose } from '../avatar/sprite';
import { LAYER_ORDER, requestLayerAsset } from '../avatar/sprite';
import { AVATAR_RADIUS_TILES, TILE_PX } from '../engine/config';

const FACING_OFFSET: Record<Direction, [number, number]> = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

export function renderAvatar(ctx: CanvasRenderingContext2D, avatar: Avatar, pose: Pose): void {
  const r = AVATAR_RADIUS_TILES * TILE_PX;
  drawLayeredAvatar(ctx, avatar, pose, avatar.facing, avatar.x, avatar.y, r);

  // Facing dot stands in for R5's directional walk/idle poses where no real
  // asset covers a given layer+pose+direction combination yet.
  const [ox, oy] = FACING_OFFSET[avatar.facing];
  ctx.beginPath();
  ctx.arc(avatar.x + ox * r * 0.5, avatar.y + oy * r * 0.5, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

/**
 * Draws one avatar at an arbitrary point/scale (world position or a fixed
 * HUD portrait slot). Each layer independently checks for its own real
 * asset and falls back to a code-drawn placeholder — a real body.png with
 * no matching hair.png still renders correctly, half real art, half fallback.
 */
export function drawLayeredAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: Avatar,
  pose: Pose,
  facing: Direction,
  cx: number,
  cy: number,
  r: number,
): void {
  for (const layer of LAYER_ORDER) {
    const asset = requestLayerAsset(avatar.id, layer, pose, facing);
    if (asset) {
      ctx.drawImage(asset, cx - r, cy - r, r * 2, r * 2);
      continue;
    }
    if (layer === 'body') {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = avatar.palette.body;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Clothing/hair placeholders are clipped to the body silhouette so they
      // never poke past it; real assets aren't masked this way; a real
      // sprite's own alpha channel defines its shape.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      drawLayerPlaceholder(ctx, layer, avatar.palette, cx, cy, r);
      ctx.restore();
    }
  }
}

function drawLayerPlaceholder(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  palette: AvatarPalette,
  cx: number,
  cy: number,
  r: number,
): void {
  switch (layer) {
    case 'clothing':
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.15, r, 0, Math.PI, false);
      ctx.fillStyle = palette.clothing;
      ctx.fill();
      break;
    case 'hair':
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.25, r * 0.85, Math.PI, 0, false);
      ctx.fillStyle = palette.hair;
      ctx.fill();
      break;
    default:
      break;
  }
}
