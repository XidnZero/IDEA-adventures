/**
 * R18/R19 — Day/night lighting. This is the ONLY module in the entire
 * codebase permitted to read the device's wall-clock. R19 is a hard wall
 * (CLAUDE.md): "Day/night reads the device clock. Needs read foreground-only
 * play time. These two clocks must never touch the same variable." This file
 * takes an optional `Date` purely for testability (defaulting to `new
 * Date()`), reads nothing from `sessionMs` / `needState.ts`, and exports
 * nothing that any of those modules could import back — the dependency edge
 * only ever points one way, and it terminates here.
 *
 * Kept deliberately simple per the build brief: a flat ambient screen-space
 * tint (no parallax risk — it's not tied to world/camera position at all,
 * see R1), plus an `isNight` flag main.ts uses to light up lamp objects.
 * Realism is explicitly not the goal; the clock separation is.
 */

export interface LightingState {
  r: number;
  g: number;
  b: number;
  alpha: number;
  isNight: boolean; // true = interior lights (lamps) render lit, per R18
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

const NIGHT_COLOR = { r: 15, g: 25, b: 70 };
const NIGHT_ALPHA = 0.5;
const DAY_COLOR = { r: 255, g: 246, b: 214 };
const DAY_ALPHA = 0.08;

// Dawn 5-7, dusk 18-22 (local device time), flat day/night outside those
// windows. Hour is a fractional 0-24 value so the transition is smooth
// rather than a hard jump-cut.
export function getLightingState(date: Date = new Date()): LightingState {
  const hour = date.getHours() + date.getMinutes() / 60;

  let dayness: number; // 0 = full night, 1 = full day
  if (hour < 5 || hour >= 22) {
    dayness = 0;
  } else if (hour < 7) {
    dayness = smoothstep(5, 7, hour);
  } else if (hour < 18) {
    dayness = 1;
  } else {
    dayness = 1 - smoothstep(18, 22, hour);
  }

  return {
    r: Math.round(lerp(NIGHT_COLOR.r, DAY_COLOR.r, dayness)),
    g: Math.round(lerp(NIGHT_COLOR.g, DAY_COLOR.g, dayness)),
    b: Math.round(lerp(NIGHT_COLOR.b, DAY_COLOR.b, dayness)),
    alpha: lerp(NIGHT_ALPHA, DAY_ALPHA, dayness),
    isNight: dayness < 0.5,
  };
}
