# Phase 1 — v1 Build

Full house, both avatars, parent NPCs, care loop, day/night, interactables,
mini-game shell + toybox sorting, parent gate, offline install.

Art: **placeholder-first.** Every visual asset slot must work with a code-drawn
fallback and swap silently to a real file if present (see CLAUDE.md → Art pipeline).
Do not block any R-item on art being finished.

## Build order (suggested — re-sequence if a dependency is discovered)

1. **World engine core** — plain canvas, ASCII room loader (R4), object anchor system,
   walkability derived from footprints.
2. **R1 — Following camera.** Top-down orthographic, kid-readable zoom. All rooms in the
   house are composited into one continuous scene (each room positioned in a shared
   world-tile grid, not hard-cut per room); the camera holds still inside a dead-zone
   around the avatar and eases toward them only once they cross that zone's edge. Camera
   clamped to the whole house's outer bounds, tracks avatar only. No parallax.
3. **R2 — House replica.** 9 rooms from `world/rooms/*.room`, matching the family's
   real dimensioned floor plan (250mm/tile): `living`, `bedroom_2`, `bedroom_3`,
   `main_hall` (small connector), `main_bedroom`, `bath_wc_1`, `bath_wc_2`, `kitchen`,
   `store_pantry`. Always spawn in the same room (`living`, the graph's hub).
4. **R3 — Stage/Room/Object data model.** Home is the only populated stage; structure
   supports more.
5. **R8/R9 — Movement.** Hold-and-drag steering (world layer) + separate waypoint/BFS
   auto-walk (need-bubble triggered). Keep these as two distinct code paths.
6. **R11–R14 — Care loop.** Hunger / washroom / hygiene. Session-scoped timer (foreground
   only). One need at a time. Causal chaining (eat → later washroom; play → hygiene).
   Needs shown as picture + body language (R12), never bars/numbers.
7. **R5 — Avatar sprite slots.** Layered sprite structure (body/hair/clothes), 4-direction
   walk + idle + need-state poses. Placeholder art now, real assets drop in later.
8. **R6 — Profile switching.** Two portraits, tap to choose who you're caring for. Shared
   world state, no reset on switch.
9. **R7 — Parent NPCs.** Static, authored positions, one-tap response each.
10. **R15 — Resolution routine.** Parent NPC comes over on need resolution.
11. **R16 — Interactables.** Tap → animation + sound, <150ms response, infinitely repeatable.
    Concentrate in kids' bedroom + living room. Master bedroom set incl. mirror (priority object).
12. **R17 — Mini-game shell + toybox sorting.** Full-screen popup, one-tap exit, entered
    diegetically from the living room toybox. No score/timer/wrong-answer-punish.
13. **R18/R19 — Day/night + clock separation.** Device clock drives lighting only. Verify
    with a test that need-timer and lighting-timer are structurally separate variables.
14. **R20 — Parent gate.** Non-discoverable gesture/hold to exit to browser chrome.
15. **R21/R22 — PWA + offline.** Installable, fullscreen, zero network calls at play time.

## Acceptance criteria (per R-item, check before marking done)
- R14 negative test passes: no input sequence produces distress/accident/unhappiness.
- R19 clock separation: lighting and need-timer provably read different clock sources.
- R8: dead-tap rate is zero (every tap produces *some* response).
- R9: auto-walk successfully routes through doors around furniture (BFS, not drag-steer).
- Every visual object renders correctly with zero real art assets present (full placeholder run).
- Every visual object swaps to real asset with zero code change when a matching file is added.

## Explicitly out of scope for Phase 1
School/playground stages, GUI world builder, more mini-games, tiredness need, avatar
clothing customisation, kid-facing world editing. Do not scaffold these.

## Open items NOT yet resolved (do not silently decide these — flag and ask)
Moved to `docs/open-questions.md`, together with the ones raised since, so
there's one list rather than three. Audio and the engine choice are items 1
and 2 there.
