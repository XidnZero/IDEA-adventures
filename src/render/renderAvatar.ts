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
  const [ox, oy] = FACING_OFFSET[avatar.facing];

  // R5's walk pose only ever selected an asset path, so with no real art the
  // avatar slid around as a static puck. The stride below is the placeholder
  // equivalent of a walk animation, and applies *only* while the body layer
  // has no real asset: a real walk sprite animates itself, and bobbing it
  // too would fight its own cycle. Art still drops in with zero code change.
  const usingPlaceholderBody = requestLayerAsset(avatar.id, 'body', pose, avatar.facing) === null;
  const walking = pose === 'walk' && usingPlaceholderBody;
  const stride = walking ? Math.sin(avatar.walkPhase) : 0;
  // Lifts on each step — abs() so both halves of the stride bob upward
  // rather than sinking below the floor on the back-swing.
  const bob = walking ? -Math.abs(Math.sin(avatar.walkPhase)) * r * 0.16 : 0;
  const cy = avatar.y + bob;

  if (usingPlaceholderBody) {
    drawFeet(ctx, avatar.x, cy, r, ox, oy, stride);
  }
  drawLayeredAvatar(ctx, avatar, pose, avatar.facing, avatar.x, cy, r);

  // Facing dot stands in for R5's directional walk/idle poses where no real
  // asset covers a given layer+pose+direction combination yet.
  ctx.beginPath();
  ctx.arc(avatar.x + ox * r * 0.5, cy + oy * r * 0.5, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

/**
 * Two feet peeking out from under the body, swinging in antiphase along the
 * facing axis and offset perpendicular to it, so the stride reads correctly
 * in all four directions from one piece of geometry. Drawn before the body
 * layers so they tuck underneath it.
 */
function drawFeet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  ox: number,
  oy: number,
  stride: number,
): void {
  // The swing is tuned against the body's own radius, and both bounds matter.
  // Too short and the whole stride hides under the body — the first version
  // topped out at 0.95r and was completely invisible on screen. Too long and
  // the forward foot separates into a floating dot. At 1.15r the foot's inner
  // edge still overlaps the body while ~0.45r of it protrudes. At rest both
  // tuck fully underneath, so a standing avatar shows no feet at all and the
  // appearance of a foot *is* the walk cue.
  const perpX = -oy;
  const perpY = ox;
  ctx.fillStyle = 'rgba(62,48,38,0.85)';
  for (const side of [-1, 1]) {
    const reach = r * 0.55 + stride * side * r * 0.6;
    ctx.beginPath();
    ctx.arc(
      cx + perpX * side * r * 0.42 + ox * reach,
      cy + perpY * side * r * 0.42 + oy * reach,
      r * 0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
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
