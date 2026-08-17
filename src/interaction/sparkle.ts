import { TILE_PX } from '../engine/config';

/**
 * R8 — "no dead taps": every tap on empty space produces a response
 * (CLAUDE.md), and phase-1.md's acceptance criterion is that the dead-tap
 * rate is *zero*, not low.
 *
 * Tapping an object already bounces it (interaction/tapResponse.ts) and
 * tapping walkable floor already starts the avatar walking, but a tap on a
 * wall, on the black void between rooms, or on a spot the avatar simply
 * can't reach produced nothing visible at all. This module closes that gap
 * with a short code-drawn burst at the tapped point, fired for *every* tap
 * that reaches the world layer — including ones that do something else too,
 * so the rule is "a tap always sparkles" with no conditions to get wrong.
 *
 * Deliberately not a fail signal and not a hint: the same friendly burst
 * appears whether the tap did something or nothing (R14). It's silent, since
 * the audio approach is still undecided — see docs/open-questions.md.
 */

export const SPARKLE_MS = 460;

// Plenty for a toddler mashing the screen, and old ones are pruned every
// frame anyway; the cap only exists so a stuck pointer can't grow the array
// without bound.
const MAX_SPARKLES = 32;
const DOT_COUNT = 6;

interface Sparkle {
  x: number; // world pixels
  y: number;
  startMs: number;
  seed: number; // rotates each burst so repeated taps don't look identical
}

export interface SparkleState {
  sparkles: Sparkle[];
}

export function createSparkleState(): SparkleState {
  return { sparkles: [] };
}

export function addSparkle(state: SparkleState, x: number, y: number, nowMs: number): void {
  if (state.sparkles.length >= MAX_SPARKLES) state.sparkles.shift();
  state.sparkles.push({ x, y, startMs: nowMs, seed: Math.random() * Math.PI * 2 });
}

/** Number of bursts still alive. Exists for tests; rendering prunes its own. */
export function activeSparkleCount(state: SparkleState, nowMs: number): number {
  return state.sparkles.filter((s) => nowMs - s.startMs < SPARKLE_MS).length;
}

/**
 * Draws in world space — call inside the camera transform so a burst stays
 * on the spot that was tapped rather than sliding with the camera (R1 forbids
 * anything that reads as drift).
 */
export function renderSparkles(
  ctx: CanvasRenderingContext2D,
  state: SparkleState,
  nowMs: number,
): void {
  state.sparkles = state.sparkles.filter((s) => nowMs - s.startMs < SPARKLE_MS);
  if (state.sparkles.length === 0) return;

  ctx.save();
  for (const sparkle of state.sparkles) {
    const t = (nowMs - sparkle.startMs) / SPARKLE_MS; // 0 -> 1
    const eased = 1 - (1 - t) * (1 - t); // fast out, gentle settle
    const fade = 1 - t;

    // Every shape is drawn as a dark halo first, then the bright shape on
    // top. Without this the burst is nearly invisible on the two surfaces it
    // most often lands on — the cream room floor and the mini-game's cream
    // backdrop are both close to the highlight colour — while a purely dark
    // burst would disappear against walls and the void between rooms. Two
    // tones means it reads on any background without knowing what's under it.
    const halo = `rgba(90,66,32,${0.4 * fade})`;

    // Soft core, gone quickly — gives the burst a bright centre at the exact
    // tap point so the response reads instantly, before the eye follows the
    // ring outward.
    const coreFade = Math.max(0, 1 - t * 2.4);
    if (coreFade > 0) {
      ctx.beginPath();
      ctx.arc(sparkle.x, sparkle.y, TILE_PX * 0.34 * coreFade, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,250,225,${0.7 * coreFade})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(90,66,32,${0.3 * coreFade})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Expanding ring. Grows to roughly the project's ~120px minimum touch
    // target (CLAUDE.md) so the response is at the same scale as the gesture
    // that caused it, rather than a detail a toddler has to look for.
    const ringRadius = TILE_PX * (0.22 + eased * 0.95);
    ctx.beginPath();
    ctx.arc(sparkle.x, sparkle.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = halo;
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,250,225,${0.95 * fade})`;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Dots flung outward from the tap point.
    const dotDistance = TILE_PX * (0.26 + eased * 1.05);
    const dotRadius = TILE_PX * 0.11 * fade;
    for (let i = 0; i < DOT_COUNT; i++) {
      const angle = sparkle.seed + (i / DOT_COUNT) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(
        sparkle.x + Math.cos(angle) * dotDistance,
        sparkle.y + Math.sin(angle) * dotDistance,
        Math.max(0, dotRadius),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(255,226,140,${0.95 * fade})`;
      ctx.fill();
      ctx.strokeStyle = halo;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  ctx.restore();
}
