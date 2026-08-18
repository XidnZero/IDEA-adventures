/**
 * R13 — the foreground play-time clock, and the single place the
 * no-offline-decay rule is actually enforced.
 *
 * CLAUDE.md's first hard prohibition: "No offline decay. Needs advance ONLY
 * while the app is foregrounded and open. Closing the app freezes all state,
 * full stop. No Date.now() deltas across sessions."
 *
 * Two things make that true, and both live here:
 *
 * 1. The clock is advanced by frame deltas, never by reading a wall clock.
 *    requestAnimationFrame stops firing when the page is hidden, so a closed
 *    or backgrounded app contributes nothing at all.
 * 2. Each delta is clamped. Without the clamp, rAF resuming after an hour in
 *    the background would hand over one enormous frame and the clock would
 *    jump an hour forward in a single step — offline decay by another route,
 *    reintroduced by deleting one `Math.min`. The clamp caps that leak at a
 *    single frame's worth of time, no matter how long the gap was.
 *
 * This was an inline expression in main.ts's frame loop. It is a named,
 * tested module now because it carries a prohibition, not because the
 * arithmetic is hard.
 */

/**
 * Longest delta a single frame may contribute. Also doubles as the physics
 * safety bound movement relies on: avatar speed x this must stay below the
 * avatar's radius, or a slow frame could step through a wall (asserted in
 * tests/movementCollision.test.ts).
 */
export const MAX_FRAME_SECONDS = 0.05;

export interface SessionClock {
  /** Total foreground play time this session, in ms. Never persisted. */
  ms: number;
  /** Timestamp of the previous frame, or null before the first one. */
  lastFrameMs: number | null;
}

export function createSessionClock(): SessionClock {
  return { ms: 0, lastFrameMs: null };
}

/**
 * Advances the clock for one frame and returns that frame's delta in seconds.
 * `frameNowMs` is a monotonic frame timestamp (rAF's argument) — never a
 * wall-clock reading.
 */
export function tickSessionClock(clock: SessionClock, frameNowMs: number): number {
  const previous = clock.lastFrameMs;
  clock.lastFrameMs = frameNowMs;

  // The very first frame has nothing to measure against. Contributing zero is
  // the honest answer, and avoids treating page-load time as play time.
  if (previous === null) return 0;

  const elapsed = (frameNowMs - previous) / 1000;
  // Negative can happen if a timestamp source ever went backwards; clamping
  // at both ends keeps the clock monotonic regardless.
  const dt = Math.max(0, Math.min(MAX_FRAME_SECONDS, elapsed));
  clock.ms += dt * 1000;
  return dt;
}
