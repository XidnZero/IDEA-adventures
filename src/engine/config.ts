// Rendering scale. Tile size in meters is provisional (docs/decisions.md) and
// unrelated to TILE_PX — meters will matter once real room measurements and
// R1 zoom are validated; pixels are purely a rendering choice today.
export const TILE_PX = 48;
export const TILE_METERS = 0.25;

export const AVATAR_SPEED_TILES_PER_SEC = 2.6;
export const AVATAR_RADIUS_TILES = 0.32;

export const SPAWN_STAGE = 'home';
export const SPAWN_ROOM = 'living_room'; // R2: always spawn in the same room.
