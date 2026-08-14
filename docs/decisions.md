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

**2026-08-14 — R18/R19 shipped: day/night lighting + the clock-separation
hard wall.** `src/engine/dayNight.ts` is now the *only* module in the
codebase permitted to read the device's wall-clock; it exports
`getLightingState(date = new Date())`, a pure function of an optional `Date`
that returns a flat `{r,g,b,alpha,isNight}` tint. It takes no `sessionMs`
input, is never imported by `needState.ts`, and `needState.ts`/`main.ts`'s
`sessionMs` accumulation is untouched by this work — the dependency edge
points one way and terminates in this one file. `main.ts` recomputes
`lighting` from `getLightingState()` once per frame (a fresh `new Date()`
read every time, deliberately not cached/derived from anything else) and
draws it as a flat `fillRect` tint *after* `ctx.restore()` — i.e. in screen
space, after the camera transform, so it's uniform across the viewport and
structurally cannot introduce parallax/camera drift (R1). `isNight` is
threaded into `renderRoom()` as a plain boolean and used to draw a soft
radial glow behind `lamp` objects (`R16`'s only existing "interior light"
furniture) — spec.md's R18 also mentions windows, but no window object
exists in the authored rooms yet, so only lamps light up; flagging this as a
partial reading of R18, easy to extend once a window object is authored.
Kept deliberately unambitious on realism (dawn/dusk are a `smoothstep` over
a plain day/night color lerp) per the build brief — the point of this
R-item is the clock separation, not lighting fidelity.

Proved the separation two ways. (1) Structural: `grep -rn "Date" src/` shows
exactly one file touching the wall clock — `dayNight.ts` — and neither
`needState.ts` nor `main.ts`'s `sessionMs` line reference it. (2) Dynamic,
via a temporary Playwright-visible debug hook (`window.__debugClock`,
exposing `sessionMs()` and `lighting()`, removed before the final
typecheck+build pass — same catch-and-release pattern as the R11-14 debug
hook): froze `Date`/`Date.now()` completely (never advancing, for the whole
run) via `page.addInitScript`, sampled both clocks, waited 2.2 real seconds,
sampled again. Result: `lighting` was byte-identical before/after (proves it
only ever reads the frozen `Date`), while `sessionMs` had advanced by
~2217ms over the real 2200ms wait (proves it's driven by rAF delta-time,
completely unaffected by freezing `Date`). Separately mocked `Date` to a
fixed 2am vs. a fixed 2pm and confirmed `isNight`/tint differ correctly and
visibly (screenshots). All four scripts live in the Playwright scratchpad
used for this session, not in the repo.

**2026-08-14 — R20 shipped: parent gate via a sustained-still hold in the
screen's bottom-right corner, ~3.5s, ~24px jitter tolerance.** Chosen
specifically to *not* need a third movement/input system: `main.ts`'s
existing single pointerdown/move/up chain gained a side-channel
(`gateHold`/`gateOpen`) that only ever watches pointer state — it never
blocks or alters any existing behavior (drag-steer, need-bubble tap, object
tap) unless it actually fires. A pointerdown landing in the fixed 140x140px
bottom-right zone (screen space, not world/camera — chosen because it's
empty during normal play: the profile switcher lives top-left, the need
bubble tracks the avatar which is usually mid-screen, and the mini-game's
own exit glyph, when that overlay is open, is top-right and never
overlapping since the gate is disabled entirely while the mini-game owns
input) starts a hold timer; any movement past ~24px or any pointerup cancels
it; only surviving untouched for the full 3.5s opens the gate. This is
judged hard for a 2-3yo to trigger by accident because: normal play in that
corner (a quick tap, a drag that passes through it) still does exactly what
it would anywhere else, so there's no behavior change to stumble into; and
the one gesture that *does* open it — pressing down and holding
motionless for over three seconds in one specific, visually blank spot — is
the opposite of how toddlers interact with a touchscreen (Phase-0-observed
whole-hand taps and drags, not sustained stillness). Verified with
Playwright: a quick tap and a normal mid-screen drag both leave the gate
closed; a 4-second still hold in the corner opens it; releasing alone does
not close it (must be an explicit tap); a tap anywhere then closes it
(one-tap exit, R10).

The gate currently opens a full-screen dimmed placeholder panel (plain ring
+ dot, no text, no real controls) — **explicitly a placeholder**, flagged
here per the build brief: there is no "browser chrome" to exit to yet (that
depends on R21, shipped in this same session, but wiring the gate to an
actual exit/close action is out of scope for this pass). The gate proves it
does something distinguishable and has a one-tap way back; wiring it to a
real destination is future work once there's an actual installed/fullscreen
context to exit from.

**2026-08-14 — R21/R22 shipped: installable, fullscreen-capable, offline
PWA shell.** `public/manifest.webmanifest` (`display: "fullscreen"`,
`name`/`short_name: "IDEA adventures"`) is linked from `index.html` alongside
`theme-color`/`apple-mobile-web-app-capable` meta tags. Read `name` as OS
chrome metadata (install dialog / home-screen label), not in-app content —
the same reasoning already applied to `<title>` in `index.html`, which
predates this session and was never flagged as a text violation; flagging
this reading here too in case it's wrong. Icons are two PNGs
(192/512, `any` + `maskable`) generated by literally drawing them with
canvas primitives in a headless-Chromium script and exporting
`toDataURL('image/png')` — the same code-drawn-placeholder technique this
project already uses for every other visual asset slot, just rasterized
once at build time instead of every frame; the script isn't part of the
repo (scratchpad-only), so regenerating the icons later means rerunning
that pattern or dropping in real art.

`public/sw.js` is a hand-written service worker (no build-time-generated
precache manifest, since there's no `vite-plugin-pwa` dependency and the
brief scoped this to shell/manifest/SW plumbing, not new tooling). On
`install`, it fetches `/index.html`, regex-scans it for every `src=`/`href=`
it references (the built hashed JS bundle, the manifest, the icons — whatever
is actually linked, so nothing needs to be hand-listed or kept in sync with
Vite's hashed output names) and caches all of it. The `fetch` handler is
cache-first with a background refresh for anything already cached, and
network-first-with-cache-fallback for anything not yet cached. World data
needed no new caching consideration — it's already bundled into the JS at
build time via `?raw` imports (see the 2026-08-14 Vite/TS entry above), so
there's nothing to fetch there at all, offline or online.

One deliberate carve-out: requests to `/assets/<name>.png` (the
`requestAsset()` art-fallback slots) are handled specially rather than
through the generic cache-first path, because `/assets/` collides with
Vite's own build output directory (`/assets/index-<hash>.js` lives at the
same prefix) — an early version of this carve-out accidentally excluded the
JS bundle itself from caching by matching on the `/assets/` prefix alone;
fixed by also requiring a `.png` extension. With that fixed, these
requests still try the network first (so real art, once it exists, loads
and gets cached normally), but a network failure — the *only* case that
happens today, since no real art exists yet — resolves to a harmless empty
`200` response instead of letting the failure propagate, because a genuine
`404` from a live server is silent in the browser console but a raw
service-worker-observed network failure (or an explicit non-2xx Response
returned from `respondWith`) is not; an empty `200` still fails to decode as
an image, so `requestAsset()`'s existing `onerror` fallback fires exactly as
it does online today — just without spurious console noise. Verified with
Playwright end-to-end against a real `vite build` + `vite preview` (not just
the dev server, to avoid Vite's dev-only HMR-websocket console noise
skewing the "zero errors" check): manifest fetches and validates, service
worker reaches `active` and takes control, and — with `context.setOffline(true)`
after one prior online load — the app reloads, renders, and a drag visibly
moves the avatar, with zero console/page errors throughout.

Both this session's temporary Playwright-visible debug hook
(`window.__debugClock`, used for the R19 proof above and a `gateOpen()`
check for the R20 proof) were removed before the final `tsc -b` +
`vite build` pass, per this project's established convention (see the
R11-14 entry above) — grepped for `__debug`/`TEMP` afterward to confirm.

**2026-08-14 — R1 reworked: composited whole-house world + threshold/dead-zone
pan camera, replacing per-room hard-cut rendering.** The camera was built
correctly against the *original* reading of R1 ("hard-cut doorways, no
parallax") but that reading is reversed as of this entry, at explicit user
request: every room in the house now renders simultaneously, each positioned
in one shared world-tile grid, and the camera pans smoothly instead of
snapping when a room changes. spec.md's R1 line and phase-1.md's build-order
item 2 are updated to match; treat this entry as the record of *why* they no
longer say "hard-cut."

Each `.room` file gained a required `pos: [x, y]` header field (tile offset
in the house-wide grid), authored manually rather than inferred from door
adjacency — inference was rejected because door pairs only encode
`(target room, target spawn tile)`, not which wall/side a door sits on, so
there isn't enough information to place rooms automatically. `DoorDef` (the
`to`/`spawn` payload) is gone entirely: with one continuous walkable grid,
walking through a doorway is just walking, so a door tile (`D`) now only
means "render a floor-mat visual here instead of plain floor" — see
`world/worldGrid.ts`'s `findRoomAtWorldTile`/`isWalkableWorldTile`, which
resolve any world-tile coordinate to whichever room (if any) contains it.
`loadWorld.ts`'s old door-consistency check (did `to`/`spawn` point at a real,
walkable tile) is replaced by a room-overlap check (no two rooms' world-tile
footprints may intersect, since they're drawn on top of each other otherwise).

Positioning the house forced an actual floor-plan redesign, not just a
coordinate assignment pass: `living_room`'s south wall originally hosted
doors to both `kitchen` (13 tiles wide, the same width as living_room itself)
and `toilet_bath` 4 tiles apart, which is geometrically impossible once both
neighbors need to sit flush against that wall without overlapping — kitchen
alone already spans the entire width. Rather than shrink/redraw kitchen's
interior (a bigger content change, touching fridge/stove/parent placement),
`toilet_bath` was relocated to a corner of living_room's north wall not
already covered by `bedroom_parents` (which is 9 tiles wide against
living_room's 13-tile wall, leaving a 2-tile gap at the east end). Only
`living_room.room` and `toilet_bath.room` needed grid edits (moving one door
character each); the other five rooms only needed the new `pos:` header
field added — their existing door placements already lined up edge-to-edge
with their neighbors once given the right offset. Verified no two rooms'
world-tile bounds overlap (`tsc -b` passes `loadWorld.ts`'s new check) and
that every door pair's tiles land on directly-adjacent world coordinates
(hand-computed and cross-checked before editing, since a gap of even one
tile would make that doorway uncrossable — there's no teleport fallback
anymore).

Avatar position (`avatar.x`/`avatar.y`) changed meaning from room-local px to
world-px in this same pass — a prerequisite for continuous movement across a
room boundary. `avatar.roomId` is kept only as bookkeeping (which room's
local grid the avatar's world position currently falls in), refreshed every
frame via `movement/shared.ts`'s new `updateAvatarRoomId`; nothing in
movement/collision reads it anymore. `movement/bfsPath.ts` and
`movement/autoWalk.ts` were both simplified by this: BFS now runs directly
over the world grid via `isWalkableWorldTile` with plain 4-directional
neighbors (no more per-room graph + door-edge special case), and
`stepAutoWalk` no longer needs the mid-step "jump to the paired spawn tile"
logic from the R11-14 entry above — that whole class of bug (path desyncing
from the avatar's actual room) can't occur when there's no discrete room
jump to desync from.

The camera itself (`engine/camera.ts`) became stateful — `computeCameraOffset`
was a pure function of avatar position each frame; `updateCamera` now holds
persistent `{x, y}` and only nudges it once the avatar's *screen* position
(computed from that persisted camera state) crosses a dead-zone rectangle
around screen-center, easing toward a "just inside the dead-zone again"
target with a framerate-independent exponential smoothing term. This still
satisfies CLAUDE.md's "camera only moves when the avatar moves": a
stationary avatar produces a stationary desired position, so the ease target
never changes and the camera never drifts. Clamped to the composited house's
outer bounds (`worldGrid.ts`'s `getWorldBoundsPx`) the same way the old
per-room clamp worked, just against the whole house instead of one room.
