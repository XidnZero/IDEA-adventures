# Spec Reference (compact)

Source of truth is Notion "IDEA adventures". This is a build-relevant extract,
not a full sync. Do not treat as active build context — see phase-1.md for that.

## Product
Browser game, 2 kids (2–3yo). Avatars from photos, world = exact home replica.
Player = caregiver looking after the avatar, not the avatar itself.

## Core loop
3 needs (hunger, washroom, hygiene) surface while app is open. Child resolves by
walking avatar to the right fixture. Clock stops when app closes — nothing decays
offline, nothing ever fails.

## v1 scope
Home stage only: full house, both kid avatars, parent NPCs, care loop, day/night,
mini-game shell w/ one game (toybox sorting). School/playground are later stages.

## Users
- 3yo: taps deliberately, can drag, understands cause-effect, cannot read.
- 2yo: whole-hand taps, no fine motor, can't drag reliably. Success = every touch delights.
- Author: must cost minutes to extend, not evenings.

## Needs table
| Need | Mirrors | Resolved by |
|---|---|---|
| Hunger | Meals/snacks | Kitchen fridge/table |
| Washroom | Toilet training | Either toilet; kitchen toilet is default auto-walk target |
| Getting dirty | Play sweat, bath time | Shower/bath |

Needs are **caused**, not just timed: eating → later washroom; running around → hygiene.
Unmet needs → patience only (fidget, hold tummy, look at door). Never distress, never accident.

## Requirements map (R1–R22) — full detail in docs/phase-1.md
- R1 Following camera: whole house composited into one continuous scene (all rooms
  loaded at once, positioned in a shared world grid), kid-readable zoom, threshold/
  dead-zone pan (camera holds still until the avatar crosses a screen-space threshold,
  then eases toward keeping them just inside it again) instead of a hard per-room cut.
  Still no parallax/independent camera drift — it only ever reacts to avatar movement.
  (Revised 2026-08-14 from the original "hard-cut doorways" reading — see decisions.md.)
- R2 Full house replica: kitchen, living room, 3 bedrooms, 2 toilets. Fixed spawn room.
- R3 Stage→Room→Object data model from commit 1; v1 populates Home only.
- R4 ASCII room format (ADR below).
- R5 Avatar from photo, layered sprites, 4-dir walk + idle + need poses. Author-only, one-off.
- R6 Profile switch = who you're caring for, not who you are. Third-person copy, real names.
- R7 Parent NPCs: static, authored positions, one-tap response, no pathfinding.
- R8 Hold-and-drag world movement, no other gestures, ~120px targets, no dead taps.
- R9 Need-bubble auto-walk = separate BFS pathing, kitchen toilet default target.
- R10 No dead ends: no locks, no confirm dialogs.
- R11 3 needs, session-scoped timer (foreground only), one need at a time, ~3–5min pacing.
- R12 Needs = pictures + body language only, photographic-literal icons.
- R13 Frozen while closed; reopen = calm baseline.
- R14 No failure/accidents/shame — structural. Negative test: no input sequence causes distress.
- R15 Parent NPC praises on resolution.
- R16 Interactables: tap→anim+sound <150ms, infinite repeat. Concentrated in kids' room + living
  room. Master bedroom set includes priority **mirror** object.
- R17 Mini-game shell, full-screen, one-tap exit, diegetic entry. Launch title: toybox sorting
  (sort by colour/shape, no score/timer/fail). Input declared per-game.
- R18 Day/night follows device clock; interior lights stay on at night.
- R19 **Clock separation hard wall** — lighting clock ≠ need-timer clock. Never share a variable.
- R20 Parent gate: non-discoverable exit gesture.
- R21 Offline PWA, installable, fullscreen.
- R22 Zero network calls at play time.

## Non-goals (do not build)
Offline decay, any losing/fail state, meters/bars/numbers, instructional text, scores/timers-
as-pressure/currency, camera scroll/drift, locked doors, accounts/cloud saves, multiplayer,
monetisation/analytics, school/playground stages (v1).

## ASCII world format (R4)
```
world/
  rooms/*.room       # one per room
  objects.yaml        # char → object definition, global legend
  stages.yaml          # room → stage mapping
```
Room file = header (id, stage, size, doors) + grid. Grid = walls/floor/doors/spawn/**anchors**
only — never draw furniture shapes character-by-character.

Rules:
1. Anchor, don't draw — a bed is one char + `size` in objects.yaml, not an ASCII blob.
2. Derive walkability from object footprints. Never hand-author a collision layer.
3. One global legend across all rooms (e.g. `T` = toilet everywhere).

Tile size ~25cm (provisional — see decisions.md, needs re-validation against R1 zoom change).

## Phase 0 spike findings (already resolved, don't re-litigate)
- Hold-and-drag (continuous pointer-follow) beats single-tap-to-point. → R8 baseline.
- Object footprint collision approach confirmed working.
- Photographic-literal need icons (rice bowl, toilet) beat generic glyph/meter. → R12 baseline.
- Art: code-drawn primitives hit a hard ceiling vs. target painterly reference style.
  Decision: placeholder-with-fallback pattern, real art slots in later with zero code change.
- Plain canvas held up fine at spike scale; revisit engine choice once multi-room + animated
  sheets + mini-games are concurrent.

## Explicitly deferred (P1/P2 — do not scaffold in Phase 1)
More mini-games (alphabet-animals, kitchen tidy, shadow match, etc.), school/playground stages,
tiredness need, session soft-limit, GUI world builder, kid-facing world editing, avatar
clothing customisation.
