## R1 rework #2 — room layout rebuilt from real floor plan, single master grid

**Date:** 2026-08-16
**Author:** Wei Han + Claude (Claude.ai), for Claude Code to apply

### Problem

The previous room set (`living_room`, `bedroom_parents`, `bedroom_a`, `bedroom_b`,
`kitchen`, `toilet_kitchen`, `toilet_bath`) had hand-authored `pos:` values that
satisfied the no-overlap constraint but did **not** reflect the family's real HDB
flat. Adjacencies were wrong (e.g. bedrooms placed west/east of living room when
in reality both are north of it; main bedroom placed north of living room when
it's actually accessed via a side corridor).

### Method

Derived one shared master grid at 250mm/tile directly from the floor plan's
labeled dimension chains, then placed every room by real adjacency (not by eye).
Every room boundary was checked programmatically for (a) zero overlaps and
(b) every door tile matching a door tile in the correct neighboring room at the
same world coordinate. This catches the class of bug that shipped last time —
several early drafts of this rebuild had dangling doors or floating rooms, all
caught and fixed before this version.

### Renamed / restructured rooms

| Old room id | New room id | Note |
|---|---|---|
| `living_room` | `living` | Widened to bounding-box the real L-shape (see below) |
| `bedroom_a` | `bedroom_3` | Renamed to match plan labels |
| `bedroom_b` | `bedroom_2` | Renamed to match plan labels |
| `bedroom_parents` | `main_bedroom` | Renamed, repositioned south of bedroom_2 (was north of living room) |
| `toilet_bath` | `bath_wc_1` | Repositioned off the new `main_hall`, south of `main_bedroom` |
| `toilet_kitchen` | `bath_wc_2` | Repositioned off `main_hall`, south of `bath_wc_1`, bordering kitchen |
| `kitchen` | `kitchen` | Unchanged id, repositioned south of `main_hall`/`bath_wc_2` |
| — | `main_hall` (new) | Corridor room; did not previously exist. Connects living, bedroom_2, main_bedroom, both baths, store_pantry, and kitchen. |
| — | `store_pantry` (new) | The apartment shelter/store room; was missing from the shipped set entirely. |

### Known simplifications / low-confidence items

- **Living/dining is genuinely L-shaped** in the real flat (bedroom_3 and
  bedroom_2 both open into it, and it also borders the hall). Per team decision,
  represented as ONE rectangle sized to the L's bounding box — consistent with
  how kitchen's angled corner is already handled — rather than splitting into
  two rooms. **The interior notch is not yet carved as wall tiles** — shipped as
  a full rectangle for v1 because the plan doesn't give precise interior corner
  coordinates. Revisit if this causes a visible/walkable "cheat" through where
  a wall should be.
- **Bath/WC 1 and 2 depths are estimated**, not measured. The plan only labels
  one dimension for each (1700mm, 1600mm); the other was estimated at ~1.7x per
  typical HDB toilet proportions. Treat both rooms' exact size as placeholder.
- **Kitchen is an irregular/angled room**, represented as a bounding box with
  the 45° corner approximated as a stepped diagonal wall cut (same pattern as
  before). Not a precise match to the real angle.
- **Main hall width (6 tiles / 1500mm) is estimated** from a partial annotation
  near the bath/kitchen junction on the plan, not a labeled dimension.
- **Furniture placement (sofa, toybox, bed, mirror, lamp, fridge, table,
  toilet) is placed by judgment**, not measurement — the plan's blue
  hand-markup doesn't include dimension lines for furniture position.

### Legend gap carried over (unresolved)

No `objects.yaml` character exists for wardrobe/cabinets, which appear multiple
times in the plan's blue markup (bedroom_3, bedroom_2, main_bedroom, store_pantry
all show cabinet/wardrobe hatching). Room files do not place a stand-in for
these yet — adding one is a prerequisite for main_bedroom's mirror-adjacent
interactables work already on the roadmap.

### Verification performed

- No room-pair overlaps (programmatic check on final `pos`/`size` set)
- Every `D` door tile has a matching `D` at the same world coordinate in the
  correct neighbor room (programmatic check)
- No spawn point lands on a wall or object tile (caught and fixed one instance:
  `bath_wc_2` spawn was on the toilet tile)
- All furniture characters used are valid entries in the current `objects.yaml`
