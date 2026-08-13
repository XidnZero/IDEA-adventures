import type { Avatar } from '../avatar/avatar';
import { drawLayeredAvatar } from '../render/renderAvatar';

/**
 * R6 profile switching: tap a portrait to choose who you're caring for.
 * Portraits are purely visual (photo/palette + selection ring) — no name
 * text is rendered under them. CLAUDE.md's "no labels/instructional text"
 * prohibition is a hard wall that applies here too; spec.md's "real names"
 * note is read as third-person *voice* for any future copy elsewhere in the
 * app, not a mandate to print a name label in a v1 with zero on-screen text.
 */
const PORTRAIT_RADIUS = 56; // ~112px diameter, meets the ~120px touch target rule
const PORTRAIT_GAP = 20;
const MARGIN = 20;

function portraitCenter(index: number): { x: number; y: number } {
  return {
    x: MARGIN + PORTRAIT_RADIUS + index * (PORTRAIT_RADIUS * 2 + PORTRAIT_GAP),
    y: MARGIN + PORTRAIT_RADIUS,
  };
}

export function renderProfileSwitcher(
  ctx: CanvasRenderingContext2D,
  avatars: Avatar[],
  activeIndex: number,
): void {
  avatars.forEach((avatar, i) => {
    const { x: cx, y: cy } = portraitCenter(i);

    ctx.beginPath();
    ctx.arc(cx, cy, PORTRAIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, PORTRAIT_RADIUS - 4, 0, Math.PI * 2);
    ctx.clip();
    drawLayeredAvatar(ctx, avatar, 'idle', 'down', cx, cy + PORTRAIT_RADIUS * 0.3, PORTRAIT_RADIUS * 0.9);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, PORTRAIT_RADIUS, 0, Math.PI * 2);
    ctx.lineWidth = i === activeIndex ? 6 : 2;
    ctx.strokeStyle = i === activeIndex ? '#ffd23f' : 'rgba(0,0,0,0.25)';
    ctx.stroke();
  });
}

export function hitTestProfileSwitcher(avatars: Avatar[], screenX: number, screenY: number): number | null {
  for (let i = 0; i < avatars.length; i++) {
    const { x: cx, y: cy } = portraitCenter(i);
    if (Math.hypot(screenX - cx, screenY - cy) <= PORTRAIT_RADIUS) return i;
  }
  return null;
}
