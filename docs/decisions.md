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
