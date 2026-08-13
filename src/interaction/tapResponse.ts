/**
 * Shared tap-response mechanic (R7 parent NPCs, R16 interactables): tap a
 * static world object and it plays a short, retriggerable bounce in place.
 * Originally written for parent NPCs (src/npc/npcTap.ts); generalized here
 * because R16 interactables are the same mechanic — a keyed (roomId, tx, ty)
 * bounce timer, infinitely repeatable, no state machine, no fail path. Any
 * object kind that wants "tap -> instant animated response" reuses this
 * instead of growing its own copy.
 *
 * Visual-only for now: audio approach (recorded voices vs. SFX) is still an
 * open item in phase-1.md, so no sound is wired up here.
 */
const BOUNCE_MS = 380;

export interface TapResponseState {
  activeSince: Map<string, number>;
}

export function createTapResponseState(): TapResponseState {
  return { activeSince: new Map() };
}

function key(roomId: string, tx: number, ty: number): string {
  return `${roomId}:${tx},${ty}`;
}

export function triggerTapResponse(state: TapResponseState, roomId: string, tx: number, ty: number, now: number): void {
  state.activeSince.set(key(roomId, tx, ty), now);
}

/** Returns a vertical pixel offset (negative = up) for the current bounce, or 0 if idle. */
export function getTapResponseOffsetPx(state: TapResponseState, roomId: string, tx: number, ty: number, now: number): number {
  const k = key(roomId, tx, ty);
  const start = state.activeSince.get(k);
  if (start === undefined) return 0;
  const elapsed = now - start;
  if (elapsed >= BOUNCE_MS) {
    state.activeSince.delete(k);
    return 0;
  }
  return -Math.sin((elapsed / BOUNCE_MS) * Math.PI) * 10;
}
