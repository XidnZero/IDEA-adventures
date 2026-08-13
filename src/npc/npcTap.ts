/**
 * One-tap parent NPC response (R7): static, no pathfinding — tapping a
 * parent just plays a short bounce in place, retriggerable any time
 * (R16's "infinitely repeatable" rule applies here too, ahead of R16 itself).
 * Visual-only for now: audio approach (recorded voices vs. SFX) is an open
 * item in phase-1.md that hasn't been decided, so no sound is wired up yet.
 */
const BOUNCE_MS = 380;

export interface NpcBounceState {
  activeSince: Map<string, number>;
}

export function createNpcBounceState(): NpcBounceState {
  return { activeSince: new Map() };
}

function key(roomId: string, tx: number, ty: number): string {
  return `${roomId}:${tx},${ty}`;
}

export function triggerNpcBounce(state: NpcBounceState, roomId: string, tx: number, ty: number, now: number): void {
  state.activeSince.set(key(roomId, tx, ty), now);
}

/** Returns a vertical pixel offset (negative = up) for the current bounce, or 0 if idle. */
export function getBounceOffsetPx(state: NpcBounceState, roomId: string, tx: number, ty: number, now: number): number {
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
