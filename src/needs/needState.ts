import type { Need } from '../world/types';
import {
  CAUSAL_WASHROOM_DELAY_MS,
  HYGIENE_ACTIVITY_THRESHOLD_SEC,
  NEED_MAX_INTERVAL_MS,
  NEED_MIN_INTERVAL_MS,
} from '../engine/config';

/**
 * Per-avatar need tracking (R11-14). `sessionMs` is always the foreground
 * play-time clock accumulated in the render loop — never Date.now() — so
 * this whole module is naturally frozen while the app is closed (R13) and
 * has nothing to do with the day/night clock (R19's hard wall).
 *
 * There is deliberately no fail state anywhere in here: an unmet need just
 * stays active until walked off. Nothing in this module can mark an avatar
 * distressed, and nothing here ever should.
 */
export interface AvatarNeedState {
  active: Need | null;
  nextNeedAtMs: number;
  hygieneActivitySec: number;
  pendingWashroomAtMs: number | null;
}

function randomIntervalMs(): number {
  return NEED_MIN_INTERVAL_MS + Math.random() * (NEED_MAX_INTERVAL_MS - NEED_MIN_INTERVAL_MS);
}

export function createNeedState(sessionMs: number): AvatarNeedState {
  return {
    active: null,
    nextNeedAtMs: sessionMs + randomIntervalMs(),
    hygieneActivitySec: 0,
    pendingWashroomAtMs: null,
  };
}

/** Advances one avatar's need state by one frame. Mutates `state` in place. */
export function advanceNeedState(
  state: AvatarNeedState,
  sessionMs: number,
  dtSeconds: number,
  isMoving: boolean,
): void {
  if (isMoving) state.hygieneActivitySec += dtSeconds;

  if (state.active !== null) return; // one need at a time (R11)

  // Causal chain takes priority once its delay has elapsed, regardless of
  // the general pacing timer — eating really does lead to washroom.
  if (state.pendingWashroomAtMs !== null && sessionMs >= state.pendingWashroomAtMs) {
    state.active = 'washroom';
    state.pendingWashroomAtMs = null;
    return;
  }

  if (sessionMs < state.nextNeedAtMs) return;

  if (state.hygieneActivitySec >= HYGIENE_ACTIVITY_THRESHOLD_SEC) {
    state.active = 'hygiene';
    state.hygieneActivitySec = 0;
    return;
  }

  state.active = 'hunger';
}

export function resolveNeed(state: AvatarNeedState, sessionMs: number): void {
  // Only schedule if nothing's already pending, so a later, unrelated meal
  // can't keep pushing an already-caused washroom need further out.
  if (state.active === 'hunger' && state.pendingWashroomAtMs === null) {
    state.pendingWashroomAtMs = sessionMs + CAUSAL_WASHROOM_DELAY_MS;
  }
  state.active = null;
  state.nextNeedAtMs = sessionMs + randomIntervalMs();
}
