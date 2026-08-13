/**
 * R20 — Parent gate: a non-discoverable gesture to step out of play, into
 * whatever "browser chrome" ends up meaning once R21 (fullscreen/installed
 * PWA) lands. See docs/decisions.md for the exact gesture choice and why
 * it's judged hard for a 2-3yo to trigger by accident, and for the explicit
 * flag that the overlay's contents below are a placeholder — there is
 * nothing to route to outside the app yet, so it only proves the gate does
 * something distinguishable and has a one-tap way back (R10: no dead ends).
 *
 * This module owns geometry + rendering only; the actual hold-timer state
 * (start time, jitter cancellation, open/closed) lives in main.ts's existing
 * single pointerdown/move/up chain, the same way miniGame state does.
 */

// Bottom-right corner of the *screen* (not world/camera) — empty space
// during normal play: the profile switcher lives top-left, the need bubble
// tracks the avatar (usually mid-screen), and the mini-game's exit icon
// (when that overlay is open) is top-right and never overlaps this gate,
// since the gate is disabled entirely while the mini-game owns input.
export const GATE_ZONE_PX = 140;
export const GATE_HOLD_MS = 3500;
export const GATE_JITTER_PX = 24;

export function inGateZone(screenX: number, screenY: number, rectW: number, rectH: number): boolean {
  return screenX >= rectW - GATE_ZONE_PX && screenY >= rectH - GATE_ZONE_PX;
}

/**
 * Placeholder panel: dims the screen and shows a single plain ring, no text,
 * no controls that do anything real yet (R21 isn't built). Tapping anywhere
 * closes it — same "always exactly one obvious way out" pattern as the
 * mini-game's exit glyph.
 */
export function renderParentGate(ctx: CanvasRenderingContext2D, rectW: number, rectH: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(12,12,18,0.93)';
  ctx.fillRect(0, 0, rectW, rectH);

  const cx = rectW / 2;
  const cy = rectH / 2;
  const r = 56;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
  ctx.restore();
}
