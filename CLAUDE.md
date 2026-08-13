# CLAUDE.md

Browser game for 2 kids (ages 2–3). Read this before any code change.

## What this is NOT
This LLM will want to add: a hunger bar, a sadness state, an accident animation,
a decay timer on `Date.now()`. **Every one of these is a violation.** They look
reasonable in a diff. They are not reasonable here.

## Hard prohibitions
- **No offline decay.** Needs advance ONLY while the app is foregrounded and open.
  Closing the app freezes all state, full stop. No `Date.now()` deltas across sessions.
- **No fail state, ever.** No accidents, no death, no sickness, no "you don't have food."
  Explicit test: no sequence of input or inaction can make the avatar appear unhappy,
  wet themselves, or go hungry to visible distress.
- **No meters/bars/numbers/words for needs.** Needs render as pictures + body language only.
- **No instructional/navigational text.** No labels, no tutorial copy, no dialogue.
  (Letterforms as game *content*, e.g. an alphabet mini-game, are fine — see R17/P1.)
- **No scores, timers-as-pressure, wrong answers, currency, progression.**
- **No locked doors / dead ends.** Every door opens. Every state has a one-tap exit.
- **No network calls during play.** Local-only. No analytics, no ads, no accounts.
- **No parallax / camera drift / background scroll.** Camera only moves when the avatar moves.
- **Clock separation is a hard wall (R19).** Day/night reads the device clock.
  Needs read foreground-only play time. These two clocks must never touch the same variable.

## Architecture constraints (matter now even though not used in Phase 1)
- **Sprites are layered from the start** (base body / hair / clothing), even though
  clothing swap is P2. Retrofitting layering later is expensive; building it flat now
  is a silent tax on every future asset.
- **Stage → Room → Object data model** exists from commit 1, even though v1 ships
  Home only. Do not hardcode "the house" as the only possible stage.
- **World is authored as plain-text ASCII rooms** (see docs/decisions.md for format).
  Never introduce a binary/GUI-authored scene format.
- **Walkability is always derived from object footprints, never hand-authored** as a
  separate collision layer.
- **One global legend** for ASCII tile characters across all room files. Not per-room.

## Interaction model
- World layer: hold-and-drag steering (continuous pointer-following), NOT single-tap-to-point.
  Confirmed in Phase 0 spike — "leading the avatar by the hand" felt correct.
- Need-bubble auto-walk uses a *separate* movement mode: waypoint/BFS pathing to a single
  confirmed destination. Do not reuse drag-steering logic for this — Phase 0 spike hit
  stutter bugs mixing the two (recomputing path on every pointer-move fought the avatar's
  current step).
- Minimum touch target ~120px. No dead taps — every tap on empty space produces sparkle/sound/turn.
- Mini-games declare their own input model per-game (R17); the no-drag rule is world-layer only.

## Art pipeline (current state)
Partial real assets exist. Everything must render with **code-drawn placeholder fallback**
if a real asset is missing — this was already proven in the Phase 0 spike and must carry
into v1. Pattern: check for `assets/<name>.png` next to the room/object; if absent, fall back
to a flat-shape canvas draw. Never hard-fail or blank-render on a missing asset.

## Source of truth
This file = prohibitions and standing architecture rules only, ~1 page, always in context.
- `docs/spec.md` — full product spec (Notion-synced, do not treat as build order)
- `docs/phase-1.md` — current scope + acceptance criteria (THE build order)
- `docs/decisions.md` — architecture decisions log — **append here whenever you make
  a call mid-build.** Uncaptured reasoning is gone next session.

Keep P1/P2 scope out of active context while building Phase 1. Seeing the roadmap causes
premature scaffolding for features not yet in scope.
