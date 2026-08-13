# Decisions Log

Claude Code: append here whenever you make an architectural call mid-build.
Keep entries short — decision + one-line why. Newest at bottom.

---

**2026-08-13 — Movement split into two systems.** Drag-steering (world layer, no
path planning, axis-separated obstacle sliding) is separate from waypoint/BFS pathing
(need-bubble auto-walk only). Mixing them caused stutter in the Phase 0 spike
(path recomputed every pointer-move, fighting mid-step position).

**2026-08-13 — Art fallback pattern confirmed.** Objects/sprites check for a real
asset file first (e.g. `sprite.png`), silently fall back to code-drawn placeholder
if missing. Validated in Phase 0 spike; carries into Phase 1 as a hard requirement,
not a nice-to-have.

**2026-08-13 — Tile size ~25cm, provisional.** Held up at Phase 0 spike scale (single
mocked-up living room). Not yet validated against real measured room dimensions or
the new camera-follow zoom level (R1). Re-measure before finalizing room files.

**2026-08-14 — Build tooling is Vite + TypeScript; the engine itself stays plain
canvas.** Vite/TS is bundling and dev-server tooling only, not a game framework —
it doesn't touch the "plain canvas held up at spike scale" open question in
phase-1.md, which is still unresolved and revisited once multi-room + animated
sheets + mini-games are concurrent.

**2026-08-14 — `.room` files use YAML frontmatter for the header.** Delimited by
`---` lines, parsed with the same `yaml` package used for objects.yaml/stages.yaml,
so there's one parsing dependency instead of a bespoke header format. The grid
below the second `---` is untouched plain ASCII.

**2026-08-14 — Doors connect rooms without requiring geometric contiguity
on-screen.** R1 mandates hard-cut doorways with no parallax/camera drift, so
each room is authored and rendered independently; a door only needs a
consistent (target room, target spawn tile) pair, not real-world-adjacent
coordinates between the two rooms.

**2026-08-14 — Fixed spawn room is `living_room` (hub of the house graph).**
Encoded as `SPAWN_ROOM` in `src/engine/config.ts`, not derived from
stages.yaml's room ordering, so it can't silently change if that list is
reordered. Satisfies R2 "always spawn in the same room."

**2026-08-14 — First build pass covers world engine core + camera + house
replica + drag-steering (phase-1.md build-order items 1-5, movement half).**
BFS auto-walk (`src/movement/bfsPath.ts`) is implemented as a standalone pure
module but not wired to any trigger yet, since the need-bubble system that
would trigger it (R11-14) doesn't exist. Single avatar only — profile
switching (R6, build-order item 8) not yet built. Verified rendering,
footprint-derived walkability, and door transitions in a live browser run
(Playwright against `npm run dev`) with zero real art assets present and
zero console errors.

**2026-08-14 — Layered sprites use a 3-layer body/clothing/hair split, each
checked for its own asset independently.** `src/avatar/sprite.ts` resolves
asset paths per (avatarId, layer, pose, facing); each layer falls back to
its own code-drawn placeholder if missing, so a real `body.png` with no
matching `hair.png` still renders correctly — the art pipeline's
placeholder-fallback rule applies per layer, not just per avatar. Only
`idle`/`walk` poses exist so far; need-state poses wait on R11-14.

**2026-08-14 — Profile portraits (R6) are visual-only, no name text.**
CLAUDE.md's "no labels/instructional text" is a hard prohibition that
overrides everything else, including spec.md's R6 note about "real names."
Read that note as: any future copy elsewhere in the app should refer to the
child in third person by name, not as a mandate to print a name label under
a portrait. Portraits distinguish kids by their layered placeholder palette
(and later, real photo art) alone. Flagging this reading in case it's wrong
— it's a plausible but not certain resolution of a real tension between two
source docs.

**2026-08-14 — Parent NPCs (R7) reuse the objects.yaml anchor/footprint
system rather than a parallel `npcs:` room-header field.** `ObjectDef` gained
an optional `kind: 'npc'` discriminator; a parent is authored as a normal
single-char anchor (`P`) that blocks its tile like any other piece of
furniture. One generic "parent" type, placed at two authored positions
(living_room, kitchen) — nothing in phase-1.md calls for named/distinct
parents yet, so a second type wasn't built. Tapping a parent tile plays a
retriggerable bounce and consumes the pointer instead of starting
drag-steering underneath it, the same pattern R16 interactables will use.
No sound: audio approach (recorded voices vs. SFX) is still an open,
unresolved item in phase-1.md, so this stays visual-only until that's
decided.

**2026-08-14 — Care loop (R11-14) shipped: needs, causal chaining, and R9's
BFS auto-walk finally wired to a real trigger.** Per-avatar need state
(`src/needs/needState.ts`) runs entirely off the foreground session clock
accumulated in the render loop (`sessionMs`, driven by clamped rAF `dt`) —
never `Date.now()` — so it's naturally frozen while the app is backgrounded
or closed (R13) and has zero contact with the day/night clock (R19's hard
wall). One need at a time, 3-5 minute pacing, eating causally leads to a
washroom need ~45s later, and enough accumulated drag-steering/auto-walk
movement leads to hygiene. Needs are communicated *only* via a calm,
retriggerable, photographic-literal icon bubble (bowl/toilet/droplet) above
the avatar's head, plus a matching small badge on that avatar's portrait —
never a bar, number, or change to the avatar's own body language. R5's
need-state poses ("fidget, hold tummy, look at door") are deliberately not
built yet; adding real body-language poses is riskier to get right than a
neutral icon under R14's zero-distress rule, so it's deferred rather than
attempted half-right. Tapping the bubble runs a real cross-room BFS path
(`findNeedTarget` picks the correct fixture, defaulting to `toilet_kitchen`
for washroom per R9) and hands it to the auto-walk system built earlier.
R15 ("parent comes over") is implemented as a stationary celebration — the
parent NPC in the resolution room bounces in place — since R7 explicitly
forbids NPC pathfinding; literally walking the parent across the room would
violate that.

Ran an explicit R14 negative-test pass over this code: nothing in
`needState.ts`, `renderNeedBubble.ts`, or `renderAvatar.ts` has any concept
of elapsed-unmet-need severity, a fail state, or a body-language/pose change
tied to need state — `renderAvatar`'s pose only ever reflects whether the
avatar is currently being dragged, never which need (if any) is active. An
unresolved need just sits there calmly, forever, blocking new needs (one at
a time) but never escalating, decaying, or rendering differently. No input
sequence or inaction can produce distress because the code has nothing that
*could* render distress.

Found and fixed two correctness bugs while building this: (1) `autoWalk.ts`
was relying on `dragSteer.ts`'s floor-position-based door crossing, which
could fire mid-step — before the avatar reached the tile-center threshold
`stepAutoWalk` used to advance its own path index — permanently
desyncing the walk from its path (avatar would cross into the next room but
freeze at the spawn tile forever). Fixed by having `autoWalk.ts` handle
door-crossing itself, tied directly to path-node consumption instead of a
generic position check. (2) `resolveNeed` was unconditionally overwriting
`pendingWashroomAtMs` on every hunger resolution, which could perpetually
delay an already-caused washroom need if hunger re-triggered before the
causal delay elapsed; fixed by only scheduling it if nothing is already
pending. Both were caught via a temporary debug hook exposing live state to
Playwright (never shipped) after visually confirming the auto-walk was
stalling in the browser — screenshots alone weren't enough to diagnose the
frame-by-frame desync.

**2026-08-14 — R16/R17 shipped: interactables + toybox-sort mini-game.**
`src/npc/npcTap.ts` (R7's bounce) is generalized into
`src/interaction/tapResponse.ts` — same keyed-by-(roomId,tx,ty) retriggerable
bounce timer, now used by both parent NPCs and R16 interactables, since
they're the same mechanic (tap → instant animated response, infinitely
repeatable, no state machine). `ObjectDef.kind` widened from `'npc'` to
`'npc' | 'interactable' | 'minigame'`: `interactable` reuses the shared
bounce; `minigame` (only the toybox, `X`) skips the bounce and instead opens
the R17 overlay. Wired generically in `main.ts`'s pointerdown handler and in
`renderRoom.ts`'s bounce lookup — neither cares which specific object it is,
only its `kind`.

New interactable object types added to `world/objects.yaml`: `Y` toy, `L`
lamp, `R` frame (picture), plus `M` mirror (already existed as a placeholder,
now wired with `kind: interactable`) and `X` toybox (now `kind: minigame`).
Placed toy/lamp/frame across `bedroom_a`, `bedroom_b`, and `living_room` per
R16's "concentrated in kids' bedrooms + living room"; the master bedroom
keeps just the mirror as its priority object, per spec. All four kept
visual-only (no sound) for the same reason R7's bounce is silent: audio
approach is still an unresolved open item in phase-1.md.

R17 mini-game shell (`src/minigame/toyboxSort.ts`) renders and reads input
entirely in screen space — no camera, no world tile coordinates — and is
driven from `main.ts` by a single `miniGame: ToyboxSortState | null`
variable that, when non-null, short-circuits pointerdown/move/up *before*
any world-layer logic (profile switcher, need bubbles, drag-steer) runs, and
replaces the world render with `renderToyboxSort` for that frame. This keeps
the mini-game's input model (drag-a-shape-into-a-bin) fully separate from
both existing movement systems, as R17 requires ("mini-games declare their
own input model") — it isn't a third movement system, it's not movement at
all, just a local drag-offset per shape.

Sorting is by colour only (3 bins × 2 shapes each, shape *type* — circle/
square/triangle — is cosmetic variety, not part of the matching rule) to
keep v1 "very simple" per the build brief; colour-or-shape from spec.md is
read as "pick one for v1," not "build both." A drop that lands on the wrong
bin, or on empty space, just animates the shape back to its home position —
no shake, no red-X, no sound cue, matching R14's zero-distress rule extended
to the mini-game. On sorting all 6 shapes, bins pulse gently for ~1.8s and
then silently reshuffle a fresh set — there is no "you win" screen and no
stopping point, so the game is infinitely replayable with no fail path to
reach that state, ever.

Exit is a fixed top-right circular door-arch glyph (~128px touch target,
code-drawn, no text) that's always present and always live — tapping it
anywhere in its radius closes the overlay immediately regardless of drag
state, satisfying "every state has a one-tap exit" without any instructional
copy ("tap here to exit" was explicitly out per CLAUDE.md).
