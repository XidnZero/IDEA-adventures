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

**2026-08-15 — Wall thickness reduced to 20%, flush to interior; door-mat
tiles reduced to one per connection.** Two follow-up visual fixes on the R1
composite. First, `renderRoom.ts`'s wall tiles now draw as a thin strip (20%
of a tile) flush against the interior floor tile they border, instead of a
full-tile fill centered in the cell — the full-tile version read as an odd
double-thick block now that two adjacent rooms' walls sit right next to each
other. Collision is untouched; only the fill rect shrank. Second, each door
connection previously rendered as two adjacent door-mat squares (one 'D' tile
authored per room, both at the shared seam), which read as a 2-tile-wide
opening. Each connection now keeps exactly one side's 'D' char and the other
side's matching tile is changed to plain '.' (still floor, still walkable —
crossing still needs both tiles passable — just not mat-styled), so the
opening reads as one square. The room closer to `living_room` in the house
graph keeps the 'D' (living_room keeps all 5 of its doors; `kitchen` keeps
its door to `toilet_kitchen`); the other five rooms' matching door tiles
became '.'.

**2026-08-15 — Real-world floor plan reconciled after user hand-edited the
`.room` ASCII to match their actual house.** The edit used a pre-R1 door
scheme (lettered door chars + a `doors:` header dict, e.g. `k: kitchen`)
that the current engine no longer parses at all — doors are single literal
`D` grid tiles with no header, positioned via each room's `pos:` (see the R1
entry above). Wrote a standalone validator (Playwright/Node scratchpad, not
in the repo) that runs the same checks `roomLoader.ts`/`loadWorld.ts` do but
collects every problem instead of throwing on the first one; it found 44
issues, all stemming from the format mismatch plus stale `pos:` values (room
sizes grew substantially but positions weren't recomputed, so every room
overlapped its neighbors) plus two new object chars (`W`, `N`) with no
`objects.yaml` entry.

User confirmed by chat: `bedroom_2` = `bedroom_a`, `bedroom_3` = `bedroom_b`,
`main_hall` = `bedroom_parents`, `toilet_bath` is en-suite off
`bedroom_parents` (not off `living_room`/hall as originally authored), and
`store_pantry`/`access_balcony`/`aircon_ledge` don't exist as rooms and their
doors should be removed. `W`/`N` were not confirmed — guessed as
wardrobe/sink (interior-placed, matching furniture rather than wall fixtures
like a real window) and added to `objects.yaml` with placeholder colors, no
`need`/`kind`; flagging this guess for correction.

One edge was dropped rather than rebuilt: `bedroom_parents`' own authored
door and `living_room`'s authored door to it (both nominally "the door to
main_hall") can't both be real given `main_hall` = `bedroom_parents` — that's
a self-referential edge, not a second real doorway. Since `bedroom_a`
already connects to both `living_room` and `bedroom_parents` directly, a
literal separate `living_room`↔`bedroom_parents` doorway is also
geometrically impossible to add alongside that: with `bedroom_a` sandwiched
between them (living_room north, bedroom_a middle, bedroom_parents south —
forced by `bedroom_a`'s own two doors, one per edge), `bedroom_parents`'
whole top wall sits below `bedroom_a`'s whole bottom wall, leaving no
y-coordinate left for `living_room` and `bedroom_parents` to *also* touch
directly (a simple rectangle can't have its one edge at two different world
positions). Connectivity from `living_room` to `bedroom_parents` therefore
routes through `bedroom_a` only. Flagging this in case a real second
hallway-style doorway was actually intended — it would need either a
resized room or an L-shaped corner arrangement, deliberately not attempted
here.

Beyond the door fixes, several other authored door edges also conflicted on
which wall they were meant to share (e.g. `bedroom_a`'s door to `living_room`
and `living_room`'s door to `bedroom_a` were both authored on their own "top"
wall, which can't both be true for one shared wall) — these were resolved by
picking whichever side's wall was already geometrically valid and relocating
the other side's door tile to match, rather than preserving both rooms'
original wall choice. `kitchen.room` itself wasn't touched by the user's
edit, but `living_room`'s new door to it moved from `living_room`'s bottom
wall to its right wall, so `kitchen`'s own door (and by extension
`toilet_kitchen`'s) had to move from top-wall to left-wall to stay attached
— a reminder that a room being unedited doesn't mean its position/orientation
is still correct once a neighbor's layout changes.

Final positions (world tile offsets): `living_room` [0,0] (unchanged, still
the graph hub), `bedroom_b` [-1,-16] (north), `bedroom_a` [4,25] (south),
`bedroom_parents` [2,41] (further south), `toilet_bath` [9,54] (south of
that, en-suite), `kitchen` [21,18] (east), `toilet_kitchen` [34,18] (further
east). Verified three ways before touching the real app: (1) a from-scratch
overlap check across all 7 rooms' world-tile bounds, (2) a pairwise
walkable-adjacency check confirming every room borders a walkable tile in
some other room (not just a `D`-to-`D` check — several valid connections
now have only one side rendered as a door mat, per the entry above, so the
other side is plain floor with no `D` char at all), and (3) a real BFS from
`living_room`'s spawn tile across the full composited grid confirming all 7
rooms are reachable by an actual walk, not just pairwise-adjacent islands.
Only then ran `tsc -b && vite build` and a Playwright pass against the live
app (zero console errors, screenshots confirmed the avatar walks
living_room → bedroom_a → bedroom_parents continuously).

Not fixed, flagged instead: `living_room` still has an `S` (shower,
`need: hygiene`) object placed in it, which was already true before this
pass and reads as a likely content mistake (showers belong in a bathroom),
but wasn't touched since relocating authored furniture without being asked
risks guessing wrong about where it should actually go.

**2026-08-15 — Floor plan corrected again after the user shared the actual
architectural drawing (a photo of a real "5-room corridor end" flat plan).**
The previous entry's dropped-edge conclusion was wrong: it read the user's
`main_hall = bedroom_parents` clarification as meaning `bedroom_a`'s door to
"main_hall" was a second, real, direct doorway to `bedroom_parents`, which
combined with `bedroom_a` also connecting to `living_room` forced an
impossible sandwich (living_room–bedroom_a–bedroom_parents stacked, leaving
`living_room` and `bedroom_parents` unable to also touch directly). The
photo shows this was a misreading — there is no `bedroom_a`↔`bedroom_parents`
doorway at all in the real flat. `LIVING/DINING` is a single hallway-like hub
that `BEDROOM 3`, `BEDROOM 2`, and the `MAIN BEDROOM` each open onto
independently and directly, alongside the kitchen. "Main hall" in the user's
door labels meant "opens onto the living/dining hallway," not "connects to
the main bedroom specifically."

Rebuilt the graph as a strict hub-and-spoke around `living_room`: `bedroom_b`
(BEDROOM 3) and `bedroom_a` (BEDROOM 2) side by side on its north wall
(matching their real widths, 2800mm/11 tiles + 3000mm/12 tiles ≈ living_room's
21-tile width); `bedroom_parents` (MAIN BEDROOM) and `toilet_kitchen`
(BATH/WC 2 — kept its pre-existing id despite the real fixture sitting near
the main bedroom, not the kitchen, rather than rename an id referenced
elsewhere) stacked on its east wall; `kitchen` on its south wall.
`toilet_bath` (BATH/WC 1, en-suite) still attaches to `bedroom_parents`
directly, per the earlier user confirmation, which the photo corroborates
(it's drawn immediately adjacent to the main bedroom). `STORE/PANTRY`,
`ACCESS BALCONY`, and the `AIR-CON LEDGE` remain unmodeled per the earlier
"remove" instruction — the engine's rectangular-room-only ASCII format
couldn't represent the kitchen's real angled wall either, so it's kept as a
plain rectangle approximation.

While rebuilding, caught and fixed one more of my own errors before it ever
reached the app: I first wrote `bedroom_a`'s living_room-connector on its
*top* edge, but `bedroom_a` sits north of `living_room` in this layout, so
the shared wall is `bedroom_a`'s *bottom* edge — the top-edge tile would
have been adjacent to nothing. Caught by re-running the same three-part
verification as the previous entry (overlap check, walkable-adjacency check,
full BFS from `living_room`'s spawn) before touching the real app, which is
exactly what surfaced it: the walkable-adjacency check flagged that specific
door tile as bordering a non-walkable neighbor. `tsc -b && vite build` and a
Playwright pass against the live app followed clean (zero console errors,
screenshots confirmed both north doorways render and the avatar walks into
`bedroom_a` continuously).

**2026-08-16 — Room ids renamed/restructured to match the real floor plan
(`living_room`→`living`, `bedroom_a`→`bedroom_3`, `bedroom_b`→`bedroom_2`,
`bedroom_parents`→`main_bedroom`, `toilet_bath`→`bath_wc_1`,
`toilet_kitchen`→`bath_wc_2`), plus a new `main_hall` corridor and
`store_pantry` room; then `main_hall`/`kitchen`/`bath_wc_2` repositioned
again same-day after review against a photo of the real flat.** The rename
landed cleanly per the room-file/world-graph checks (overlap, door-pairing,
BFS reachability — see the three-part verification pattern established
above), but it broke two hardcoded id references the checks don't cover
since they're plain string constants, not grid data: `SPAWN_ROOM` in
`src/engine/config.ts` (`'living_room'`, which no longer exists — this
would have crashed on load) and `findNeedTarget`'s preferred-washroom-room
check in `src/needs/needTargets.ts` (`'toilet_kitchen'`). Both fixed to the
new ids. Lesson for any future room rename: `grep` for the old ids across
`src/`, not just `world/`, since the parser's structural checks are blind to
plain-string room-id references in application code.

Also caught and fixed a `src/render/renderRoom.ts` wall-drawing regression
introduced alongside the rename (the "walls flush to interior floor"
change from 2026-08-15's entry was reworked to derive strip
orientation/offset from *room-boundary position* — "is this tile on
row/column 0 or width-1/height-1" — instead of from actual neighbor tiles).
That assumption breaks for any wall run not on a room's outer perimeter,
which the new `kitchen.room` has (its stepped-diagonal corner cut, unchanged
content from before the rename, sits entirely inside the room). Reverted to
neighbor-tile inspection (same approach as the original 2026-08-15 version)
but kept the flush-to-floor offset by checking which neighbor is actually
floor-ish, rather than assuming floor is always toward increasing x/y —
that combination handles both perimeter walls and interior wall runs
correctly. Verified by tracing the exact classification (`horizontal-strip`
/ `vertical-strip` / `corner` / disconnected-fallback) of all 14 of the
kitchen's interior wall tiles: all 14 would have hit the disconnected
fallback under the buggy version (drawing as tiny floating squares instead
of a connected wall), none do after the fix.

Then, same day, the user supplied a hand-drawn sketch (twice — once
unlabeled, once redrawn on top of a generated diagram of the current
layout) showing `main_hall`, `main_bedroom`, `bath_wc_1`, `bath_wc_2`, and
`kitchen` needed repositioning again: `main_hall` shrinks from a corridor
that used to run the full house height down to a small 6×6 pocket bordering
only `living` and `main_bedroom`; `kitchen` moves from east of `main_hall`
to directly south of `living` (new door, world x=20) and east of
`bath_wc_2` (reusing `bath_wc_2`'s existing west door, now facing a
different neighbor); `bath_wc_1`/`bath_wc_2` keep their existing size,
position, and mutual door, but lose their old doors to `main_hall` (which
physically no longer reaches them) and gain no replacement direct door to
`living` — confirmed explicitly by the user (baths are reached only via
`main_bedroom` → `bath_wc_1` → `bath_wc_2` → `kitchen` → `living`, a single
chain, not multiple redundant routes). This leaves an unoccupied (void)
gap in world-tile space between `main_hall`/`bath_wc_1` and `living`'s
lower/right wall — flagged as an accepted cosmetic side effect (renders as
black void), not a bug, since nothing in the confirmed door list requires
filling it.

Given a hand sketch is inherently imprecise pixel-to-tile, the door graph
was confirmed in plain language before implementing (does `main_hall` keep
a door to `living`? do the baths get a direct `living` door? does
`bath_wc_2` still connect straight to `kitchen`, or only via `living`→
`kitchen`?) rather than guessed from pixel positions — guessing wrong here
would mean re-authoring 5 room files a second time. Re-ran the full
three-part verification (overlap/door-pairing/BFS) plus `tsc -b`,
`vite build`, and a live Playwright console-error check after implementing;
also regenerated a to-scale SVG diagram of the new layout (published as an
artifact) for the user to visually confirm against their sketch, rather
than asserting correctness from the text description alone.

**2026-08-16 — Layout v4: all 9 rooms regenerated from a single script, and
the "kitchen can't touch living" claim from the previous entry retracted as
wrong.** The previous entry concluded that `kitchen` could not share a wall
with `living` because the `main_hall`/`main_bedroom`/baths column occupied
`living`'s entire east wall. That reasoning was wrong: it assumed the column
and `kitchen` had to span the *same* vertical range. In the user's sketch
`kitchen` extends well below `living`'s bottom edge, so the column only needs
to be shorter than `living` — `kitchen` then occupies the leftover rows and
shares `living`'s lower-right wall directly. Concretely: the column
(`main_hall` 4 + `main_bedroom` 8 + `bath_wc_1` 5 + `bath_wc_2` 4 = 21 tiles,
y16–36) ends before `living` does (y16–40), and `kitchen` (y37–55) overlaps
`living`'s last four rows at the x23|x24 seam. Lesson: when a room can't be
placed, check whether the blocking assumption is "these must span the same
range" before declaring a geometric impossibility — the engine's rectangles
compose fine as long as *some* row-range overlaps at a shared x seam.

Two other corrections in this pass, both from re-reading the sketch rather
than from new information: `bedroom_2` moved from above `living` to above
`main_hall` (pos [12,0]→[24,0], with `bedroom_3` taking [12,0]) — the sketch
shows only `bedroom_3` above `living`, with `living` extending further west
than any bedroom; and the two baths were re-authored long-not-tall (12×5 and
12×4) with **no door between them**, each reached independently
(`bath_wc_1` en-suite off `main_bedroom`, `bath_wc_2` off `kitchen`), per
explicit user correction. Final door graph: living↔{bedroom_3, main_hall,
kitchen, store_pantry}, main_hall↔{bedroom_2, main_bedroom},
main_bedroom↔bath_wc_1, kitchen↔bath_wc_2.

Process change worth keeping: after three failed hand-editing rounds (each
introducing off-by-one door rows or mis-sized grid rows that the validator
then caught), all 9 room files are now generated by one script
(scratchpad `gen_rooms.cjs`) that builds each grid programmatically from
(width, height, door offsets, furniture offsets) rather than by editing ASCII
by hand. Every door is written as a single expression whose world coordinate
is stated in a trailing comment, which makes the pairing checkable by reading
the script instead of by counting characters in a grid. The scratchpad
verification set also grew a fourth check beyond the established
overlap/door-pairing/BFS trio: a door-*graph* dump (which room pairs are
actually connected, plus a per-room fixture inventory) that asserts the
intended adjacency list directly, since all three earlier checks pass
happily on a layout that is internally consistent but connects the wrong
rooms — which is exactly the failure mode of the previous two entries.

**2026-08-16 — Layout v5: `bath_wc_2` enlarged to match `bath_wc_1` (both
12×5), and the one-tile-entrance convention restored across every
connection.** Layout v4 had written a `D` on *both* sides of every
connection, which renders as two stacked door-mat squares and reads as a
2-tile-wide opening — the exact problem the 2026-08-15 entry had already
solved and which v4 silently regressed. Restored that convention: each
connection now writes exactly one `D` (on the room nearer `living` in the
house graph) and opens the facing tile as plain walkable floor. Both tiles
stay walkable, so crossing still works; only the mat visual is single-square
now. The door-tile count is a direct check on this — 8 connections must
produce exactly 8 `D` tiles, and the validator's per-door "opens onto plain
floor" note is the expected state, not a warning.

Enlarging `bath_wc_2` from 12×4 to 12×5 pushed the right-hand column from 21
to 22 tiles, so `kitchen` moved down one row (pos [24,37]→[24,38]) and its
`living` door moved with it (world y38→y39). `living`/`kitchen` still overlap
for three rows (38–40) at the x23|x24 seam, which is enough for the single-
tile door.

The generator script was also restructured in this pass to declare the layout
as data — a `SPEC` table of room sizes/positions, a `CONNECTIONS` list of
(door tile, facing tile) world-coordinate pairs, and a flat `FURNITURE` list
in world coordinates — rather than as per-room imperative grid edits. Every
entry is validated as it is applied: connection tiles are asserted adjacent
and in different rooms, and furniture is asserted to land on plain floor, so
a mistyped coordinate throws at generation time instead of producing a
silently wrong grid. This is what makes the layout reviewable as a table of
world coordinates instead of by counting characters in nine ASCII blocks.

**2026-08-16 — First real art landed: 9 authored SVG sprites wired into the
object legend, plus three service-worker bugs found while verifying them.**
The sprites in `D:\Repo\Sprites` were copied into `public/assets/` renamed to
match `ObjectDef.name` (the key `requestAsset()` already resolves), so no new
lookup mechanism was needed: `Sofa.svg`→`sofa.svg` and `DiningTable.svg`→
`table.svg` fill existing slots, and `tv`/`piano`/`playpen`/`beanbag_blue`/
`beanbag_grey`/`beanbag_yellow`/`window` are new legend entries (chars
`V`/`G`/`E`/`A`/`Z`/`Q`/`I`). Each new object's footprint is chosen from its
sprite's own aspect ratio (`drawObject` fills footprint tiles exactly, so a
mismatched footprint stretches the art) — e.g. tv 680x240 → [3,1], playpen
680x480 → [3,2], beanbags 360x360 → [1,1].

`engine/assets.ts` now tries extensions in order (`svg`, then `png`) instead
of hardcoding `.png`. SVG is preferred because an object's on-screen size is
derived from its tile footprint, so raster art would need re-exporting per
footprint/zoom while one vector file covers every case. The placeholder
fallback is unchanged in spirit: running out of candidate extensions is the
ordinary "no art yet" state, not an error.

Windows are authored on the floor tile against a wall, not on the wall tile
itself — `roomLoader.ts` requires object footprints to land on floor, and
walls are never walkable. Worth revisiting if wall-mounted fixtures become
common (R18's window lighting would want it), but it reads correctly today.

Three service-worker problems surfaced only because real art finally existed;
all were found by testing against `vite build` + `vite preview` rather than
the dev server, per the convention in the R21/R22 entry above:

1. **The `/assets/*.png` carve-out never cached anything**, which was correct
   when no art existed but would have rendered placeholders offline for
   objects that now have real sprites. It now checks cache → network → empty
   200, and caches successes. Extended to `.svg` as well.
2. **`res.ok` is not sufficient to decide a response is real art.** Both the
   dev server and `vite preview` answer a *missing* file with a 200 serving
   `index.html` (Content-Type `text/html`), so caching on status alone stored
   a copy of the HTML shell under every empty art slot and pinned a stale
   shell at those URLs. Fixed by requiring `Content-Type: image/*` before
   caching. Verified by asserting nothing with `text/html` is cached under
   `/assets/`.
3. **`Vary: Origin` broke offline boot entirely — a pre-existing bug, not a
   regression from this work.** `vite preview` sends `Vary: Origin`; cache
   entries are written from plain same-origin `fetch(url)` calls that send no
   `Origin` header, while `<script type="module">` is fetched in CORS mode and
   *does* send one. Default Vary-aware `caches.match` therefore missed the
   cached JS bundle and the app 504'd offline with a blank page — despite the
   bundle being visibly present in the cache. Fixed with a shared
   `MATCH_OPTS = { ignoreVary: true }` on every cache read; safe because
   everything cached is a same-origin GET of a static file. The R21/R22 entry
   above claims offline was verified working, so this likely regressed with a
   later Vite version's preview-server headers — flagging that the earlier
   verification cannot be assumed still valid.

Art also needed an explicit precache path: it is fetched by `<img>`, so
`precacheFromIndex()` (which scans index.html) never sees it, and on a
first-ever visit the worker is still installing while those images load, so
it doesn't observe them as fetches either — real art only became available
offline from the *second* visit. Rather than hand-maintain a list in `sw.js`
(the same sync burden `precacheFromIndex` was written to avoid), the page
posts the list it actually uses via a new `precacheArt()` in
`registerServiceWorker.ts`, derived from `world.objects`' names — so adding
art to objects.yaml needs no matching worker edit. Verified end-to-end: after
a single online load then `setOffline(true)`, the canvas renders, all nine
sprites decode at their true intrinsic sizes, and there are zero console
errors.

**2026-08-16 — Added optional `flip: x | y | both` to `ObjectDef`.** No
existing field could orient a sprite — footprint only sizes it. Implemented
as a canvas transform in `drawObject` (translate to the footprint's own
center, `scale(-1,1)`/`scale(1,-1)`, translate back, draw, restore) rather
than as pre-flipped art files or per-tile logic, so it applies uniformly to
both real art and the code-drawn placeholder glyph with one code path. Lives
in `objects.yaml` (per object *type*), matching how footprint/color/kind are
already authored — every placed instance of that character gets the same
orientation; there is no per-instance override, since a room file only ever
authors a single anchor character per object. Verified the transform in
isolation (drawing `Sofa.svg`, whose two mismatched throw pillows make a
mirror obvious) before wiring it in, rather than trusting the math unverified
— confirmed the pillows swap sides exactly as expected.

**2026-08-16 — Added `rotate: 90 | 180 | 270` to `ObjectDef`, alongside `flip`.**
Same shape as `flip`: applies to every placed instance of the object type,
lives in `objects.yaml`, and `footprint` continues to describe the object's
real world-space/collision box — for 90/270 that box has swapped aspect
versus the source art's native orientation (a 4-wide-by-2-tall landscape
sprite rotated upright needs `footprint: [2, 4]`, not `[4, 2]`, or the art
stretches instead of turning). Implemented in `drawObject` as one more step
in the existing transform stack: translate to the footprint's center,
`rotate(angle)`, then `flip`'s `scale(...)`, draw at swapped pre-rotation
dimensions when `rotate` is 90/270, restore. Rotate is applied after flip
(rotate() called before scale() in the code, so scale acts in the object's
own frame first) — an arbitrary but now-fixed order, since the two rarely
combine in practice.

Applied to `sofa` as the first real use: `footprint: [2, 4]`, `rotate: 90`.
Verified with the same isolated-canvas technique as the `flip` entry above
(reproducing `drawObject`'s exact math outside the app, not trusting it
unverified) — confirmed the rotated sofa fills its green-outlined footprint
box exactly, no stretching, and the pillow layout turns 90° as expected.

**2026-08-16 — Follow-up sizing pass on the newly-added sprites: `sofa` combines `flip: y` with `rotate: 90`, `tv` rotated 90 into a tall footprint `[1, 5]`, `playpen` enlarged to `[6, 4]`.** No code changes — `flip`+`rotate` composing correctly on the same object (sofa) is the first real use of both together, confirming the "rotate applied after flip" order from the entry above holds up outside the isolated test case. Verified with the same three checks as every layout change in this doc: the room-file validator (overlap/door-pairing/BFS) reports the larger footprints fit without collision, `tsc -b`/`vite build` are clean, and a live Playwright pass shows zero console errors.

**2026-08-17 — Phase-1 acceptance criteria are now executable tests (Vitest),
replacing throwaway verification scripts.** Every prior R-item was verified
with Playwright/node scripts written into a session scratchpad and deleted
afterwards, so each layout or care-loop change started from zero verification
— and phase-1.md asks explicitly for one of these to be a *test* ("Verify
with a test that need-timer and lighting-timer are structurally separate
variables", R19). The runner is Vitest rather than `node:test` because the
world is loaded through Vite's `?raw` / `import.meta.glob` (`loadWorld.ts`);
sharing `vite.config.ts` means the tests exercise the real loader against the
real `.room` files instead of a parallel fixture that could drift from what
ships. `npm test` runs them; they finish in well under a second.

Two of the criteria are claims about what the source is *allowed to contain*
rather than about behaviour, so `tests/helpers/sourceScan.ts` reads every
module under `src/` as text. It strips comments before matching: this
codebase documents these rules constantly in prose ("never Date.now()",
"zero-distress"), so a raw text scan would fail on its own documentation. The
rules are about code, so the scan is about code.

- `clockSeparation.test.ts` (R19) — asserts `engine/dayNight.ts` is the only
  module reading a wall clock (`main.ts` is exempted for its rAF/animation
  timestamps, with a separate assertion that `needState.ts` reads no clock at
  all); that neither clock module names the other; and that in `main.ts` the
  right-hand side of every `sessionMs` assignment mentions no date/lighting
  and every `lighting` assignment mentions no session time. Behaviourally:
  sweeping the device clock across 24 hours cannot move need state, two hours
  of session time cannot move the lighting, and `getLightingState` returns
  the same value for the same argument under wildly different system times.
- `noFailState.test.ts` (R14) — a forbidden-vocabulary scan (severity,
  urgency, escalate, distress, accident, score, isCorrect, …), a pin on
  `AvatarNeedState`'s exact field set so a new cross-cycle counter has to be
  justified, an eight-hour ignored-need run proving nothing about the need
  changes, and a 16-hour randomized session across four movement profiles.
- `houseLayout.test.ts` (R2/R4/R9) — the four checks this project has
  repeatedly needed: room disjointness, every authored door leading somewhere,
  BFS reachability, and the derived door graph plus per-room fixture
  inventory compared against an intended adjacency list held in the test.
  That last check is the load-bearing one, per the same reasoning recorded in
  earlier rounds: overlap/pairing/reachability all pass happily on a layout
  that is internally consistent but connects the wrong rooms together.
- `artPipeline.test.ts` — the placeholder-and-swap criteria, driven off
  `world/objects.yaml` itself rather than a hand-listed subset, so a newly
  authored object is covered the moment it exists. Uses a recording
  `CanvasRenderingContext2D` proxy and a fake `Image` (a "missing" file fires
  `onerror`, exactly as a real one does), which is enough because the render
  modules only ever issue draw calls and never read back.

**2026-08-17 — Fixed `tv` footprint `[1, 5]` -> `[1, 3]`; it was walling
`main_bedroom` in half.** Found by the new reachability check on its first
run, which is the whole reason that check exists. In `main_bedroom` the
window `I` covers local (10,1)-(11,1) and the TV anchored at (11,2) with a
5-tall footprint covered (11,2)-(11,6), with row 7 the bottom wall — so
column 11 was solid from wall to wall and the room's entire right side
(including its lamp and picture frame, both R16 interactables) was
unreachable from anywhere in the house. Nothing in the previous validation
round could see this: the door graph was correct, every door paired, and
per-room BFS between spawn tiles succeeded, because the split is *inside* one
room and behind furniture. Hence the additional flood-fill check that every
walkable tile in the house is reachable from spawn, not just every room.

`[1, 3]` is also the correct value on the footprint rule's own terms: the art
is 680x240, which rotated 90 is 1:2.83, so `[1, 5]` was stretching it — the
sizing pass that introduced it recorded the aspect in a comment but didn't
match it.

**2026-08-17 — Flagged, not fixed: the hygiene threshold crowds hunger (and
therefore the washroom chain) out of normal play.** Surfaced by the
randomized session test, which initially only ever produced `hygiene`.
`HYGIENE_ACTIVITY_THRESHOLD_SEC` is 90 while `NEED_MIN_INTERVAL_MS` is 180s,
and `advanceNeedState` prefers hygiene whenever the threshold is met at the
moment the pacing timer fires — so any session with more than ~30-50%
movement yields hygiene every single time. Since `washroom` is *only* ever
set by the eat-then-later causal chain, a child who actively drags the avatar
around will essentially never see hunger or the toilet. Left as-is because
retuning the constants is a design call about how the care loop should feel,
not a correctness fix; the test now runs four movement profiles (0/15/60/100%)
so it exercises both branches regardless of how this is eventually resolved.

**2026-08-17 — R18 completed: windows now let daylight in, closing the
"partial reading" flagged when R18 first shipped.** That entry noted only
lamps lit up because no window object was authored yet; `I`/`window` exists
now, so the missing half is built. `LightingState` gained `dayness` (the
0-1 value `isNight` was already being thresholded from) and `renderRoom` now
takes the whole `LightingState` instead of a bare `isNight` boolean, so the
two sources cross-fade through dawn and dusk — lamps rising as daylight falls
— rather than both jump-cutting at the 0.5 threshold. `dayNight.ts` remains
the only wall-clock reader; `renderRoom` is handed lighting as an argument
specifically so it can't develop its own opinion about what time it is.

Spill direction is derived from the grid, not assumed. Windows sit on the
floor tile against a wall (objects.yaml), so the light pool is pushed one
tile away from whichever side the wall is actually on — every window authored
today happens to be under a top wall, but a window on a side wall is equally
authorable and would otherwise light the wrong side. There's a test asserting
no authored window is free-standing, so if that ever changes the fallback
gets looked at deliberately instead of silently doing the wrong thing.

Glows are clipped to the floor tiles they can reach. This was found by
looking at the real thing rather than by reasoning: the first version lit the
black void outside the house, which reads exactly like daylight leaking
through the walls. Clipping to the room's bounding box wasn't enough either —
walls render as a thin strip with the rest of the tile left as background
(see `drawWallTile`), so a box clip still lit the wall tiles and looked like
the same leak. Clipping to floor-ish tiles within the glow's bounding box
fixes it, costs ~50 `rect()` calls per source, and handles rooms whose
outline isn't rectangular (the kitchen's stepped corner) for free.

Verified in the built app under a frozen device clock (`vite preview` +
Playwright, per the convention above), at 12:00 and 02:00, with zero console
errors: daylight pools at both bedroom windows during the day and is absent
at night; the living-room lamp is lit at night and dark during the day. The
clip was confirmed by sampling canvas pixels rather than by eye — brightness
is flat at the ambient tint right up to the room boundary and only rises
inside it. Screenshotting the bedrooms needed a temporary `SPAWN_ROOM` change
(steering the avatar there through drag-input was unreliable); reverted
before the final build, same catch-and-release pattern as the debug hooks in
earlier entries.

**2026-08-17 — Open decisions consolidated into `docs/open-questions.md`.**
They had accumulated in three places — phase-1.md's "open items" section,
scattered "flagging this in case it's wrong" notes throughout this log, and
whatever the last session happened to mention in chat — which meant the only
reliable way to find them was to reread everything. The new file lists each
one with what's undecided, why it matters, the stand-in that currently ships,
and a recommendation where there is one. `CLAUDE.md` points at it as a fourth
source of truth; phase-1.md's section now redirects there. This log stays the
append-only narrative of calls actually *made*. When an open question is
answered: implement it, log the reasoning here, delete it from there.

Ten items carried over, including several stale ones deliberately dropped
(the `S` shower in `living_room` and the `bedroom_a`/`bedroom_parents` door
notes refer to layouts superseded by the 9-room plan and no longer describe
anything real).

**2026-08-17 — R8's "zero dead taps" is now actually true.**
`src/interaction/sparkle.ts` draws a short code-drawn burst at the tapped
point. Object taps already bounced and floor taps already started a walk, but
a tap on a wall, on the black void between rooms, or on a tile the avatar
couldn't reach produced nothing visible whatsoever — so the acceptance
criterion ("dead-tap rate is zero", not low) was not met.

The call sits *above* every world-layer branch in `main.ts`'s pointerdown
handler rather than in each of their else-paths, so a future branch can't be
added that forgets it; there's a test asserting that position, and another
asserting the module never reads room/tile state at all. That's what makes
the guarantee hold without maintaining a list of cases. The screen-space
branches that run before it (profile switcher, gate, mini-game exit) each
already produce an unmistakable response of their own.

The mini-game gets its own burst list. R17 lets a mini-game declare its own
input model, but "no dead taps" isn't scoped to the world layer, and a tap
landing on no shape did nothing. It can't share the world-space list because
the overlay renders in screen space with no camera transform — the same
coordinates would land somewhere else entirely.

Two things only the live app showed, both fixed:

1. **Too faint at first.** The original burst was ~48px across; it now grows
   to roughly the ~120px minimum touch target from CLAUDE.md, so the response
   is at the same scale as the gesture that caused it instead of being a
   detail a toddler has to hunt for.
2. **Nearly invisible on cream.** Every shape is now drawn as a dark halo
   first with the bright shape on top. A single-tone burst can't work here:
   the room floor (`#f4ead9`) and the mini-game backdrop are both within a
   few percent of the highlight colour, while a dark-only burst would vanish
   against walls and the void. Two tones read on any background without the
   module needing to know what's underneath — which also keeps it free of the
   world-state coupling the test forbids.

Deliberately silent (audio is open question 1), and deliberately identical
whether the tap did something or nothing — a burst that differed on a "miss"
would be a fail signal, which R14 forbids.

Verified in the built app by sampling canvas pixels before/during/after a tap
(brightness moves and returns to baseline) and by cropped screenshots on all
three surfaces: dark wall, cream floor, and the mini-game overlay.

**2026-08-17 — R5's walk pose is now an actual animation, and pose follows
real movement rather than the drag flag.** Two separate gaps closed.

First, `main.ts` computed `pose = i === activeIndex && drag.active ? 'walk' :
'idle'`. That is false during a need-bubble auto-walk (R9), so an avatar
crossing the house to reach a toilet rendered as standing still the whole
way. Pose is now derived per-avatar from the distance actually moved that
frame — the same measurement `advanceNeedState` already consumes — so both
movement systems feed it and it cannot disagree with whichever one is
driving.

Second, `pose` only ever selected an asset path. With no avatar art authored
(none is), the placeholder was a static circle either way, so the avatar slid
around like a puck. `renderAvatar` now draws a placeholder stride: two feet
swinging in antiphase along the facing axis, plus a small upward bob. It's
built from the facing vector and its perpendicular, so one piece of geometry
covers all four directions rather than four hand-tuned cases.

`Avatar.walkPhase` is advanced by **distance travelled**, not elapsed time
(`advanceWalkPhase` in `movement/shared.ts`). The gait then matches whatever
speed the avatar is going, freezes exactly when they stop, can't drift with
frame rate — and, importantly for R19, introduces no new clock into a
codebase where clock ownership is a hard rule. Phase 0 is the neutral point
of the cycle (no swing, no bob), so a walking avatar at phase 0 renders
identically to an idle one; that's what keeps the animation from popping when
movement starts or stops, and there's a test pinning it.

The whole stride is suppressed when the body layer resolves to a real asset:
a real walk sprite animates itself and bobbing it too would fight its own
cycle. Art still drops in with zero code change. HUD portraits are unaffected
— they call `drawLayeredAvatar` directly with a fixed `idle`/`down`, so a
bobbing portrait was never possible.

Two rounds of tuning, both driven by looking at the built app rather than by
reasoning, and neither visible in a unit test:

1. **The first version was completely invisible.** Foot reach topped out at
   0.95r against a body radius of r, so the entire stride happened *underneath
   the body circle*. Every test passed — the draw calls were all there and
   correctly different between poses — while nothing whatsoever showed on
   screen.
2. **Overcorrecting detached the foot.** At 1.3r the forward foot separated
   into a floating dot next to the avatar. Settled at 1.15r, where the inner
   edge still overlaps the body and ~0.45r protrudes.

At rest both feet tuck fully under the body, so a standing avatar shows no
feet and the *appearance* of a foot is itself the walk cue. Verified across a
stride in the built app at 3x device scale (at 1x the avatar's ~15px radius
is too small to judge this by eye), zero console errors.

**2026-08-17 — Need auto-walk now heads for the nearest fixture; the
hardcoded preferred-room id is gone.** `findNeedTarget` picked
`matches.find((m) => m.roomId === 'bath_wc_2') ?? matches[0]`. That string is
a rename-patch of an older `'toilet_kitchen'` default (see the entry above
about room renames breaking plain-string ids in `src/`) — it was blind-updated
to a room that still existed and never re-examined as a *choice*. Its actual
effect in the current house: two toilets exist, in `bath_wc_1` and
`bath_wc_2`, at opposite ends of the graph, and the avatar always walked to
`bath_wc_2`. Standing inside `bath_wc_1`, tapping the need bubble sent them
out through `main_bedroom`, `main_hall`, `living` and `kitchen` to reach the
*other* toilet.

Replaced with real nearest-fixture selection. `bfsPath.ts` gained
`findPathToNearest(world, from, goals)`; because BFS expands in order of
distance, the first goal it reaches is by definition the nearest, so this
costs one search rather than one per candidate. `findPath` is now a
one-goal call into it, so there's a single search implementation.

Three knock-on improvements worth noting:

- **No room name appears in the module at all**, so a future floor-plan
  change cannot silently invalidate the choice the way the last one did.
- `findInteractionTile` became `findInteractionTiles` and returns *every*
  walkable tile bordering a fixture rather than the first. Beyond nearest
  selection, the old version could strand a perfectly reachable fixture
  whose first candidate approach tile happened to be blocked.
- `findNeedTarget` returns the path alongside the destination. Choosing the
  target already required computing it, and `main.ts` was then running a
  second identical BFS to route there.

Verified live, since the tap → auto-walk wiring in `main.ts` is the one part
of this no unit test reaches: temporarily shortened `NEED_MIN/MAX_INTERVAL_MS`
to 2-3 seconds, built, confirmed in the browser that the bubble appears, that
tapping it starts a real cross-room walk toward the kitchen fridge, and that
there are zero console errors — then reverted the constants (same
catch-and-release pattern as the `SPAWN_ROOM` change in the R18 entry).

Two new tests cover the behaviour itself: standing in either toilet's own
room must route to *that* room, and — implementation-independently — the
chosen path must be no longer than the best path to any fixture found by
brute force. Both fail against the old hardcoded version.

**2026-08-17 — "No network calls during play" is now tested, and was being
violated.** CLAUDE.md lists it as a hard prohibition and phase-1.md's R22
criterion says "zero network calls at play time", but nothing checked it.
`tests/localOnly.test.ts` now scans every module for network APIs (`fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, remote dynamic
import), for any `http(s)://` literal, and for analytics/ads/account
vocabulary. `engine/registerServiceWorker.ts` is the single exemption, and
even it is asserted to do nothing but register the worker and post it a
message — the fetching lives in `public/sw.js`, whose whole job is making the
app work *without* a network.

The structural test passed immediately. A live check did not. Recording every
request during a play session in the built app showed **18 network requests
fired mid-play**: `requestAsset` probes an art slot the first time it is
asked for, and an avatar slot is keyed by `(layer, pose, facing)`, so
turning a corner or starting to walk requested six new URLs right then.
Object art never had this problem only by accident — every room renders on
frame one, so all of it resolves during load.

Fixed by resolving the whole avatar slot matrix at startup
(`warmAvatarAssets`, `avatarAssetNames` in `avatar/sprite.ts`), which makes
avatars behave the same way objects already did. The same generated list is
handed to `precacheArt`, so the slots are also available offline from the
first visit and a new pose or facing can't be covered in one place but not
the other — there's a test asserting the matrix is complete and that both
call sites use it. Re-ran the live check: zero requests during play.

Also re-verified R21/R22 end-to-end while here, which was overdue — the
earlier entry flagged that its own offline verification "cannot be assumed
still valid" after a Vite upgrade silently broke it once. With the browser
fully offline and the page reloaded: the canvas renders (sampled 24 points
across it, all lit), real SVG art decodes, the lamp glow and night tint are
correct, zero failed requests, zero console errors. Worth repeating whenever
the build tooling changes, since the failure mode is silent.

**2026-08-17 — R1's camera rules are now tested, and R16's latency budget is
measured rather than assumed.** The camera had no test at all, despite being
governed by one of CLAUDE.md's hard prohibitions ("No parallax / camera drift
/ background scroll. Camera only moves when the avatar moves"). Those are
easy to break subtly — an ease that never quite converges reads as drift, and
anything time-driven reads as parallax.

`tests/camera.test.ts` pins: ten seconds of frames with the avatar frozen
leaves the camera byte-identical; movement *within* the dead zone likewise
moves it not at all; crossing the dead-zone edge does pan, and only on the
axis that was crossed; panning is framerate-independent (the same elapsed
time in 10 long frames and 50 short ones lands within a pixel); the viewport
never escapes the composited house bounds from any corner; a house smaller
than the viewport is centred rather than clamped to a backwards range; and
`camera.ts` references no clock, no lighting and no randomness at all —
parallax and background scroll both come from a camera taking input it has no
business taking.

One assertion had to be written more carefully than expected. The pan is an
exponential ease, so after settling it keeps moving by ~3e-10 px per frame
and never lands exactly. That is *not* the drift the rule is about: the
stationary-avatar case is exactly still, because a still avatar makes
`desired === current` so nothing is added at all. The settle assertion is
sub-pixel; the stillness assertion is exact. Worth stating plainly, because
"camera never moves" and "camera converges" are different claims and only one
of them is achievable with an ease.

Measured R16's "<150ms response" in the built app for the first time rather
than assuming it: dispatching the tap in-page (so the harness's own input
plumbing isn't counted, which isn't what the criterion is about) and watching
the canvas until a pixel changes gives **5-17ms across 8 samples, worst
16.8ms** — one frame, about 9x inside budget. Added a structural guard rather
than a timing test, since a number measured on a desktop is not a useful
assertion: the pointerdown handler must contain no `setTimeout`, `await`,
`.then` or `queueMicrotask`, which is the property that keeps the response in
the same frame.

Also gathered frame-time data under CPU throttling and recorded it in
`open-questions.md` item 2 (the engine question), which explicitly asks for
measured evidence rather than a milestone. A locked 60fps holds to ~4x
slower than this desktop and degrades to a steady 30fps at 8x rather than
falling apart. That doesn't answer the question — the real device does — but
it gives it a baseline to be compared against instead of an opinion.

**2026-08-17 — Movement collision and the R17 mini-game rules are now tested,
both verified by mutation rather than by passing.** Two of the largest
untested surfaces left. Both test suites passed on their first run, which
after the invisible-walk-animation episode is not evidence of anything, so
each was checked by deliberately breaking the code it covers:

- Making `avatarFits` always return true fails the two drag-steer tests and
  nothing else.
- Changing the drop rule from `bin && bin.color === s.color` to `bin` (any
  bin accepts any shape) fails three mini-game tests.

Restoring each brings the suite back to green. Worth doing routinely on any
test written for code that already works — a test that has never once failed
has never demonstrated it can.

`tests/movementCollision.test.ts` is a property test over the *real* house
rather than a fixture, so it covers the geometry that actually ships,
including the kitchen's stepped corner and the tiles behind every piece of
furniture. From every walkable tile whose body-box is clear, it shoves the
avatar hard in all eight directions for twenty frames at the largest `dt`
main.ts will ever pass (0.05s, clamped there), and asserts the avatar's whole
body — not just its centre — stays on walkable ground throughout. It also
pins that drag-steering *slides* along a wall rather than sticking (the whole
point of the axis-separated step: a toddler dragging roughly toward a doorway
still gets through), that auto-walk stays on walkable ground for its entire
route and actually arrives, that the largest possible single step is smaller
than the avatar's radius so tunnelling is arithmetically impossible, and that
a path home exists from every tile in the house.

`tests/miniGame.test.ts` holds down the no-fail rules in the one place where
"just a little feedback that you got it wrong" would feel natural to add. A
wrong drop and a drop on empty space must produce *identical* outcomes —
if a miss looked different from a mis-sort, the difference would be readable
as "that one was wrong". Two hundred consecutive wrong drops change nothing
at all. Completing the set reshuffles a fresh one, five rounds in a row, with
no accumulating state. The exit stays live mid-drag and during the all-done
pause. The state and shape field sets are pinned so a score or attempt
counter cannot be added quietly, the module is asserted to render no text,
and the drop rule is asserted to compare colour only — if shape type ever
joined it, a child matching on colour alone would start getting drops
rejected, which is the closest thing to a wrong answer this game could grow.

**2026-08-17 — Every remaining CLAUDE.md hard prohibition, and the `.room`
authoring constraints, now have tests.** This completes the pass: each rule
in the prohibitions list is now either enforced by a test or explicitly
recorded in `open-questions.md` as a decision that isn't mine.

`tests/prohibitions.test.ts` covers the ones that had nothing:

- **No text, anywhere.** The app is entirely code-drawn, so the whole rule
  reduces to "no module may call the canvas text API" — asserted across all
  of `src/`, currently zero hits. `index.html` is checked separately, since a
  label there would bypass every canvas-level check; its body renders no
  visible text at all. (An alphabet mini-game, R17/P1, would be a deliberate
  exception to revisit here. None exists.)
- **No meters/bars/numbers/words for needs.** Checked against the four
  modules that present a need: no text, no numeric formatting, and — the one
  that matters most — no derivation of a level, percentage, ratio or fraction
  from a need at all. A bar is the easy accidental version of this, because
  it looks like ordinary UI in a diff. Separately, the need bubble is
  asserted to choose its icon by *which* need is active and never by how long
  it has been active, which would be severity by another name.
- **No persistence.** Nothing stores anything today, so "closing the app
  freezes all state" holds trivially. The test exists so that adding storage
  becomes a deliberate act: a saved timestamp plus a restore is exactly how
  offline decay gets reintroduced, and whoever adds one has to come here and
  confront the rule first.
- **One-tap exit from every full-screen state.** Positional, like the sparkle
  check: the gate closes on any tap before anything can consume it, and the
  mini-game's exit is hit-tested before its own input handling so a shape
  can't shadow it.
- **No scores, currency, unlocks, streaks or progression** vocabulary.

`tests/roomAuthoring.test.ts` covers the three architecture constraints the
`.room` format exists to enforce. Walkability is shown to be *derived*: a 2x1
table authored as a single `K` blocks two tiles, and the second is never
written down anywhere. The legend is shown to be *global*: an unknown
character is an error rather than a silently ignored tile, which is precisely
what stops a room file introducing a symbol of its own. And the parser's
authoring errors are pinned — footprint overlapping a wall, a door or another
object; a grid disagreeing with its own header size; an unwalkable spawn; a
missing `pos`. Mis-sized grids in particular were a repeated failure mode
across layout revisions and are invisible when reading ASCII by eye.

Both suites were mutation-checked, per the practice established in the entry
above: disabling the footprint-overlap check fails exactly the test that
covers it, and adding a `<p>Tap to play!</p>` to `index.html` fails exactly
the page-text test. Restoring each returns the suite to green.

One note on tooling: the `index.html` check reads the file through Vite's
`?raw` import rather than `node:fs`. The tests share `vite.config.ts` with
the app and the project has no `@types/node`, so a Node import typechecks
fine under Vitest but breaks `tsc -b` — worth remembering, since `npm test`
passing is not sufficient evidence that the build is clean.

**2026-08-17 — R15's resolution routine was a no-op for two of the three
needs.** `celebrateInRoom` searched the room where the need was met for a
parent NPC and bounced it. Parents are authored only in `living` and
`kitchen`; washroom and hygiene both resolve in a bathroom. So the one moment
in the whole app that is unambiguously a success was acknowledged by nothing
at all, two times out of three — the need bubble simply vanished.

Found by reading `main.ts` for cross-subsystem interactions rather than by
testing a module: every piece involved was individually correct, and the gap
only exists in the relationship between where parents are authored and where
fixtures are. Confirmed against the real world data before changing anything
(a throwaway diagnostic test dumping parent rooms against each need's
resolution room).

`findNeedTarget` now returns a `fixture` reference — the anchor of the object
the route leads to, in the room-local coordinates `tapResponse.ts` already
keys on — carried back from the goal that won the BFS. `main.ts` keeps it
alongside the in-flight auto-walk (`autoWalkFixtures`) and
`celebrateResolution` bounces that fixture *unconditionally*, before looking
for a parent. The parent bounce is unchanged where a parent exists. Cancelling
an auto-walk clears the pending fixture too, so a celebration can't leak onto
a later, unrelated walk.

The fixture bounce reuses R16's existing primitive rather than inventing a
second visual language, which is the least I could do here without making a
product decision. It is a floor, not an answer — logged as open question 11,
since "parent comes over" plausibly wants parents authored into more rooms,
or something warmer at the avatar, and is probably best decided alongside
audio.

Verified live, because this is precisely the path no unit test reaches:
temporarily shortened the need intervals and the hygiene threshold, added a
temporary hook recording every `celebrateResolution` call, and drove the app
through four full need cycles with a second hook exposing the avatar's screen
position so the need bubble could be tapped accurately (fixed screen
coordinates missed it — the avatar moves and the camera pans). Result: one
celebration on the kitchen fridge and **three on the `bath_wc_2` shower**,
the parentless room where the old code did nothing, with zero console errors.
Both hooks and all three constants reverted before committing; `git diff` on
`config.ts` and a grep for the hook names confirm it.

Six tests now cover the routine, including one asserting that at least one
need still resolves in a parentless room — if the house ever gains a parent
everywhere, that test fails loudly rather than quietly losing the coverage
that matters. Mutation-checked by deleting the fixture bounce, which
reintroduces the original bug and fails exactly one test.

**2026-08-17 — Multi-pointer input: a second finger broke the drag, and
`setPointerCapture` could silently kill a tap.** CLAUDE.md records that the
Phase 0 spike observed "whole-hand taps and drags" from this age group. The
pointer handlers tracked no pointer identity at all, so a whole hand produced
several pointers and the last one to move or lift won.

Reproduced in the built app before changing anything, by dispatching real
`PointerEvent`s with distinct `pointerId`s: finger A presses and steers,
finger B taps and lifts, and `drag.active` goes false with the avatar frozen
at 0px of further movement — while finger A is still pressed. That is not an
exotic case for a two-year-old; it is roughly what every press looks like.

The same run surfaced a second, quieter bug: `canvas.setPointerCapture` throws
`NotFoundError` when the pointer is already gone, and it was the *first*
statement in the world-layer branch. A throw there aborted everything after
it, so `drag.active` was never set and the tap did nothing at all — silently,
because an exception inside an event listener has no visible effect. It now
runs last and is wrapped; capture only improves tracking when a finger slides
off the canvas, so failing it is harmless.

Fixed by giving the drag an owner. `DragState` gained `pointerId`, and the
three ownership rules moved out of the event handler into `dragSteer.ts` as
`beginDrag` / `updateDragTarget` / `endDrag`: they are rules about the drag's
own state, and inline in a handler they were neither testable nor obviously a
set that has to agree with itself. Extra fingers still sparkle and still tap
objects — no dead taps (R8) — they just cannot take over or end the steering.
The mini-game overlay got the same treatment via `miniGamePointerId`, since a
second finger lifting would otherwise drop the shape being dragged; it is
cleared when the overlay closes so the next open doesn't inherit a stale
owner.

Re-ran the same reproduction after the fix: drag stays active, the avatar
moves 52px while the first finger is still down, and zero console errors
(previously one `NotFoundError` per press). Nine tests cover the rules,
including a five-finger press released in scrambled order. Mutation-checked
by making `endDrag` ignore its pointer argument, which restores the original
bug and fails exactly the two tests that describe it.

One knock-on: `tests/deadTaps.test.ts` searched the handler for the literal
`drag.active = true` to prove the sparkle precedes the drag branch. The
refactor renamed that to `beginDrag(`, so the marker was updated. Worth
noting as a cost of positional tests — they are the right tool for "this must
happen before that", but they are coupled to how the code reads, not just to
what it does.
