import type { Need } from '../world/types';
import type { Avatar } from '../avatar/avatar';
import { AVATAR_RADIUS_TILES, TILE_PX } from '../engine/config';

const BUBBLE_RADIUS = 22;
const BUBBLE_GAP = 10;
// Visual bubble reads smaller, but the tap target still meets the ~120px rule.
const TAP_RADIUS = 60;

/**
 * Need bubbles (R12): the only way a need is ever communicated — a calm,
 * floating, photographic-literal icon. No bars, no numbers, no change to
 * the avatar's own body language (R5's need-state poses aren't built yet;
 * see docs/decisions.md for why an icon-only signal is the safer interim
 * choice given R14's zero-distress rule).
 */
export function needBubbleCenter(avatar: Avatar, nowMs: number): { x: number; y: number } {
  const avatarR = AVATAR_RADIUS_TILES * TILE_PX;
  const bob = Math.sin(nowMs / 500) * 3;
  return { x: avatar.x, y: avatar.y - avatarR - BUBBLE_GAP - BUBBLE_RADIUS + bob };
}

export function renderNeedBubble(ctx: CanvasRenderingContext2D, avatar: Avatar, need: Need, nowMs: number): void {
  const { x: cx, y: cy } = needBubbleCenter(avatar, nowMs);
  ctx.beginPath();
  ctx.arc(cx, cy, BUBBLE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawNeedIcon(ctx, need, cx, cy, BUBBLE_RADIUS * 0.7);
}

export function drawNeedIcon(
  ctx: CanvasRenderingContext2D,
  need: Need,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;

  switch (need) {
    case 'hunger':
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.15, r * 0.75, 0, Math.PI, false);
      ctx.fillStyle = '#e8dcc8';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#d99a4e';
      ctx.fill();
      break;
    case 'washroom':
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.1, r * 0.4, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e9e6e0';
      ctx.fill();
      ctx.stroke();
      break;
    case 'hygiene':
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.7);
      ctx.quadraticCurveTo(cx + r * 0.6, cy + r * 0.2, cx, cy + r * 0.7);
      ctx.quadraticCurveTo(cx - r * 0.6, cy + r * 0.2, cx, cy - r * 0.7);
      ctx.closePath();
      ctx.fillStyle = '#7ec1e0';
      ctx.fill();
      ctx.stroke();
      break;
  }
}

export function hitTestNeedBubble(
  avatar: Avatar,
  need: Need | null,
  worldX: number,
  worldY: number,
  nowMs: number,
): boolean {
  if (!need) return false;
  const { x: cx, y: cy } = needBubbleCenter(avatar, nowMs);
  return Math.hypot(worldX - cx, worldY - cy) <= TAP_RADIUS;
}
