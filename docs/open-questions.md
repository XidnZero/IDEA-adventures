# Open Questions

Decisions that are **not yours to make while building** — they were flagged
during a build pass, given a deliberate stand-in, and left for Wei Han to
decide. Everything here is currently *working*; nothing in this file is a bug
or a blocker. The stand-in is what ships until the question is answered.

Consolidated from `docs/decisions.md` (which stays the append-only narrative
log) and `docs/phase-1.md`'s "open items" section, so there is one place to
look. **When one of these is answered: implement it, record the reasoning as a
new entry in `decisions.md`, and delete the item from here.**

Do not silently resolve an item in this file by picking whichever option is
convenient mid-build. If a build pass genuinely cannot proceed without an
answer, say so and stop; if it can proceed under an assumption, proceed and
say which assumption.

---

## 1. Audio: recorded voices or sound effects only?

**Status:** blocking real audio anywhere in the app.
**Stand-in:** everything is silent. Parent NPC taps, R16 interactables, and
the R17 mini-game all respond visually only.

Every interaction that would naturally have a sound currently has none,
purely because this is undecided — not because silence was chosen. The
prohibition on instructional text (CLAUDE.md) makes audio unusually
load-bearing for a 2-3 year old, so this is worth more thought than a typical
asset question. Recorded family voices and a generic SFX set imply very
different production pipelines, so it's better decided before either is
started.

---

## 2. Engine: does plain canvas hold up?

**Status:** open by design; phase-1.md says revisit once multi-room +
animated sprite sheets + mini-games are all live.
**Stand-in:** plain canvas, no game framework. Vite/TypeScript is bundling
and dev-server tooling only.

All three of those conditions are now met and nothing has hit a ceiling: the
whole house renders every frame with a cheap AABB cull, and the full test
suite plus a production build run in well under a second. The honest reading
is that canvas is still fine and the trigger for revisiting should be a
concrete symptom (frame drops on the actual target device), not a milestone.
**Recommendation: keep canvas; re-open only on measured slowness on real
hardware.**

---

## 3. Tile size: is 25cm right?

**Status:** provisional since the Phase 0 spike.
**Stand-in:** `TILE_METERS = 0.25` in `src/engine/config.ts`, unused by
rendering.

`TILE_PX` (48) is a pure rendering choice and is *not* derived from
`TILE_METERS`, so nothing breaks either way today. The question only becomes
real when the floor plan is re-checked against measured room dimensions, or
when R1's zoom level is tuned for the target device.

---

## 4. Need pacing: hygiene crowds out hunger and the washroom

**Status:** flagged during the test-suite pass; constants untouched.
**Stand-in:** `HYGIENE_ACTIVITY_THRESHOLD_SEC = 90` against
`NEED_MIN_INTERVAL_MS = 180_000`.

`advanceNeedState` prefers hygiene whenever the activity threshold has been
met at the moment the pacing timer fires. Reaching 90s of movement inside a
180-300s window takes only ~30-50% activity, so an engaged child gets hygiene
*every single time*. Because `washroom` is only ever set by the eat-then-later
causal chain, that child will also essentially never see the toilet — one of
the three needs, and the causal chain highlighted in the spec, are both
effectively unreachable during normal play.

This is a feel question, not a correctness one, which is why it wasn't
retuned unasked. **Recommendation: raise the threshold to ~240s**, so hygiene
becomes the reward for a genuinely long active stretch rather than the
default. `tests/noFailState.test.ts` already exercises four movement profiles,
so it will keep passing whichever way this goes.

---

## 5. Parent gate: what does it exit *to*?

**Status:** R20's gesture is built and verified; its destination is not.
**Stand-in:** a full-screen dimmed placeholder panel (ring + dot, no text),
dismissed by tapping anywhere.

phase-1.md says "exit to browser chrome," but the app never enters fullscreen
programmatically — the manifest's `display: fullscreen` covers the installed
case, and in an ordinary browser tab there is no chrome to exit *to*. So
"exit" has no single obvious meaning yet.

The honest minimum is `document.exitFullscreen()` when `document.fullscreenElement`
is set and nothing otherwise, but that makes the gate a no-op in the most
common way it'll be opened during development. The real question is what the
gate is *for*: leaving the app, or reaching a parent-only settings surface
(profile management, session length, audio volume) that doesn't exist yet.
**That's a product question and it should be answered before more is built on
top of the gesture.**

---

## 6. Need-state body language (R5 poses)

**Status:** deliberately deferred, twice.
**Stand-in:** needs are communicated by a calm icon bubble above the avatar
plus a matching badge on the portrait. `renderAvatar`'s pose reflects only
whether the avatar is being dragged — never which need is active.

R5 lists need-state poses ("fidget, hold tummy, look at door") and R12 says
needs render as "pictures + body language." Body language is the missing half.
It was deferred because it sits uncomfortably close to R14's hard zero-distress
rule: "hold tummy" is one animation-tuning mistake away from reading as
discomfort to a 2-year-old, and a neutral icon can never fail that way.

This is worth doing — it's the difference between a symbol the child must
learn and a character they can read — but it needs an explicit call on how far
the poses may go, and probably wants real art rather than placeholder shapes.
**Not a code decision.**

---

## 7. Two flagged readings of the "no text" prohibition

**Status:** both are plausible resolutions of a real tension between
CLAUDE.md and spec.md; both were flagged for correction at the time.

- **Profile portraits carry no name label.** spec.md's R6 mentions "real
  names"; CLAUDE.md's no-labels rule is a hard prohibition. It was read as
  "refer to the child by name in any *future* copy elsewhere," not as a
  mandate to print a name under a portrait. Kids are distinguished by their
  layered palette (later, real photo art) alone.
- **`manifest.webmanifest`'s `name` and `index.html`'s `<title>` contain
  words.** Read as OS chrome metadata — the install dialog and home-screen
  label — rather than in-app content. The `<title>` predates that pass and
  was never flagged as a violation.

Both readings are still in force. Say so if either is wrong.

---

## 8. `W` (wardrobe) and `N` (sink) were guessed

**Status:** guessed from an ambiguous hand sketch, flagged for correction,
never confirmed.
**Stand-in:** both exist in `world/objects.yaml` as plain 1x1 furniture with
placeholder colours, no `need` and no `kind` — so they block their tile and
do nothing else. `W` is in `store_pantry`, `N` is in `bath_wc_1`.

If either was meant to be something else, it's a one-line legend change plus
whatever `.room` edits follow.

---

## 9. Wall-mounted fixtures have no representation

**Status:** noted as worth revisiting; not currently a problem.
**Stand-in:** windows are authored on the *floor* tile against a wall, because
`roomLoader.ts` requires object footprints to land on floor and walls are
never walkable. It reads correctly on screen.

R18's daylight now derives its spill direction from which side the wall is on,
so it handles the current arrangement properly. This only needs revisiting if
wall-mounted objects become common enough that "on the floor against the wall"
stops being a reasonable fiction.

---

## 10. The void gap south-east of `living`

**Status:** accepted cosmetic side effect, confirmed with Wei Han when the
door graph was settled.
**Stand-in:** renders as black void.

The confirmed door list leaves an unoccupied region in world-tile space
between `main_hall`/`bath_wc_1` and `living`'s lower-right wall. Nothing
requires filling it. Listed here only so it isn't rediscovered as a bug.
