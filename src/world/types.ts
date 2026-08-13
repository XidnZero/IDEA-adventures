export type Need = 'hunger' | 'washroom' | 'hygiene';

export interface ObjectDef {
  name: string;
  footprint: [number, number]; // [width, height] in tiles
  color: string;
  need?: Need;
}

export interface DoorDef {
  at: [number, number];
  to: string; // room id
  spawn: [number, number]; // spawn tile in destination room
}

export type Tile =
  | { kind: 'wall' }
  | { kind: 'floor' }
  | { kind: 'void' }
  | { kind: 'door'; door: DoorDef }
  | { kind: 'object'; char: string; def: ObjectDef; isAnchor: boolean };

export interface RoomDef {
  id: string;
  stage: string;
  width: number;
  height: number;
  spawn: [number, number];
  doors: DoorDef[];
  grid: Tile[][]; // grid[y][x]
  walkable: boolean[][]; // walkable[y][x]
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
