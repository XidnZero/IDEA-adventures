// Rendering scale. Tile size in meters is provisional (docs/decisions.md) and
// unrelated to TILE_PX — meters will matter once real room measurements and
// R1 zoom are validated; pixels are purely a rendering choice today.
export const TILE_PX = 48;
export const TILE_METERS = 0.25;

export const AVATAR_SPEED_TILES_PER_SEC = 2.6;
export const AVATAR_RADIUS_TILES = 0.32;

export const SPAWN_STAGE = 'home';
export const SPAWN_ROOM = 'living_room'; // R2: always spawn in the same room.

// Care loop pacing (R11). Session-scoped: driven by foreground play time
// accumulated in the render loop, never Date.now() — see docs/decisions.md
// on why that's a hard wall, not just a preference.
export const NEED_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const NEED_MAX_INTERVAL_MS = 5 * 60 * 1000;

// Causal chaining (R11/spec.md "needs are caused, not just timed"): eating
// leads to a washroom need a bit later; enough active play leads to hygiene.
export const CAUSAL_WASHROOM_DELAY_MS = 45 * 1000;
export const HYGIENE_ACTIVITY_THRESHOLD_SEC = 90;
