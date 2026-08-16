export type Need = 'hunger' | 'washroom' | 'hygiene';

export interface ObjectDef {
  name: string;
  footprint: [number, number]; // [width, height] in tiles
  color: string;
  need?: Need;
  // Absent = ordinary furniture (no tap response, blocks its footprint).
  // 'npc' = a parent (R7): static, authored position, no pathfinding, gets
  // a one-tap bounce response instead of starting drag-steering when tapped.
  // 'interactable' = R16: tap plays the same retriggerable bounce response
  // as an NPC (see src/interaction/tapResponse.ts) — infinitely repeatable,
  // no state, no fail path.
  // 'minigame' = tapping it launches a full-screen mini-game overlay (R17)
  // instead of a bounce; entry is diegetic (tap the object in the world).
  kind?: 'npc' | 'interactable' | 'minigame';
  // Mirrors the sprite (real art and the code-drawn placeholder's glyph
  // alike) about its own footprint. Applies to every placed instance of this
  // object type — there's no per-instance override, since a room file only
  // ever authors a single anchor character per object. Footprint dimensions
  // are unchanged by flipping ('x' still means "wide", not "rotated"); this
  // mirrors the art within the same footprint, it does not rotate it.
  flip?: 'x' | 'y' | 'both';
  // Rotates the sprite about its own footprint's center. `footprint` always
  // describes the object's actual world-space/collision size (unchanged by
  // this field, same rule as `flip`) — for 90/270, author `footprint` as the
  // already-rotated [width, height] (e.g. a sprite natively drawn 4 wide x 2
  // tall, rotated 90 to stand upright, needs footprint [2, 4], not [4, 2]).
  // Applied after `flip`.
  rotate?: 90 | 180 | 270;
}

// Doors carry no payload beyond their grid position: rooms are composited
// into one continuous world (R1), so walking through a doorway is just
// walking — there's nothing to teleport to. The tile only exists to render
// a floor-mat visual distinct from plain floor.
export type Tile =
  | { kind: 'wall' }
  | { kind: 'floor' }
  | { kind: 'void' }
  | { kind: 'door' }
  | { kind: 'object'; char: string; def: ObjectDef; isAnchor: boolean };

export interface RoomDef {
  id: string;
  stage: string;
  width: number;
  height: number;
  // (x,y) tile offset of this room's origin in the house-wide composited
  // world grid (R1's threshold-pan camera needs every room positioned in one
  // shared coordinate space, not authored independently — see decisions.md).
  pos: [number, number];
  spawn: [number, number];
  grid: Tile[][]; // grid[y][x], room-local coordinates
  walkable: boolean[][]; // walkable[y][x], room-local coordinates
}

export interface StageDef {
  id: string;
  rooms: string[];
}

export interface World {
  objects: Record<string, ObjectDef>;
  stages: Record<string, StageDef>;
  rooms: Record<string, RoomDef>;
}
