import type { ObjectDef, RoomDef } from '../world/types';
import type { LightingState } from '../engine/dayNight';
import { TILE_PX } from '../engine/config';
import { requestAsset } from '../engine/assets';

const WALL_COLOR = '#5b4636';
const FLOOR_COLOR = '#f4ead9';
const DOOR_MAT_COLOR = '#d8c9a3';
const VOID_COLOR = '#000000';

// Walls render as a thin strip (20% of a tile) rather than a filled tile —
// a full-tile wall reads as an oddly thick block now that adjacent rooms'
// walls sit right next to each other in the composited house (R1).
// Collision is unaffected: walkability is still derived from the full tile.
const WALL_THICKNESS_FRAC = 0.2;

function isWallAt(room: RoomDef, x: number, y: number): boolean {
  return room.grid[y]?.[x]?.kind === 'wall';
}

// Floor-ish = the side a wall strip should flush against. Anything walkable
// or object-covered counts, same as plain floor; out-of-bounds and void don't.
function isFloorishAt(room: RoomDef, x: number, y: number): boolean {
  const kind = room.grid[y]?.[x]?.kind;
  return kind === 'floor' || kind === 'door' || kind === 'object';
}

function drawWallTile(ctx: CanvasRenderingContext2D, room: RoomDef, x: number, y: number): void {
  const px = x * TILE_PX;
  const py = y * TILE_PX;
  const t = TILE_PX * WALL_THICKNESS_FRAC;

  // Run direction comes from actual neighbor tiles, not room-boundary
  // position — some rooms (e.g. the kitchen's stepped diagonal corner cut)
  // have wall runs that aren't on the room's outer perimeter.
  const horizontalRun = isWallAt(room, x - 1, y) || isWallAt(room, x + 1, y);
  const verticalRun = isWallAt(room, x, y - 1) || isWallAt(room, x, y + 1);

  // Flush the strip against whichever side actually has floor, rather than
  // assuming "floor is always toward increasing x/y" — that assumption only
  // holds on the outer perimeter.
  const offsetX = isFloorishAt(room, x + 1, y) ? TILE_PX - t : 0;
  const offsetY = isFloorishAt(room, x, y + 1) ? TILE_PX - t : 0;

  ctx.fillStyle = WALL_COLOR;
  if (horizontalRun && !verticalRun) {
    // Straight horizontal run (top/bottom wall): thin in y, full width.
    ctx.fillRect(px, py + offsetY, TILE_PX, t);
  } else if (verticalRun && !horizontalRun) {
    // Straight vertical run (left/right wall): thin in x, full height.
    ctx.fillRect(px + offsetX, py, t, TILE_PX);
  } else if (horizontalRun && verticalRun) {
    // Corner: small square flush into the interior corner so the two
    // strips meeting here connect with no gap.
    ctx.fillRect(px + offsetX, py + offsetY, t, t);
  } else {
    // Isolated wall tile with no wall neighbor on any side: centered
    // fallback, since there's no run to flush against.
    ctx.fillRect(px + (TILE_PX - t) / 2, py + (TILE_PX - t) / 2, t, t);
  }
}

export function renderRoom(
  ctx: CanvasRenderingContext2D,
  room: RoomDef,
  getBounceOffsetPx?: (tx: number, ty: number) => number,
  lighting?: LightingState,
): void {
  // Pass 1: base tiles. Object-covered tiles (anchor or footprint overflow)
  // sit on floor, so they're drawn as floor here too.
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const tile = room.grid[y][x];
      const px = x * TILE_PX;
      const py = y * TILE_PX;
      if (tile.kind === 'wall') {
        drawWallTile(ctx, room, x, y);
      } else if (tile.kind === 'void') {
        ctx.fillStyle = VOID_COLOR;
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
      } else if (tile.kind === 'door') {
        ctx.fillStyle = FLOOR_COLOR;
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
        ctx.fillStyle = DOOR_MAT_COLOR;
        ctx.fillRect(px + 4, py + 4, TILE_PX - 8, TILE_PX - 8);
      } else {
        ctx.fillStyle = FLOOR_COLOR;
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
      }
    }
  }

  // Pass 2: objects, one shape per anchor spanning its full footprint.
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const tile = room.grid[y][x];
      if (tile.kind === 'object' && tile.isAnchor) {
        // NPCs and R16 interactables share the same retriggerable bounce
        // response; minigame-launcher objects (the toybox) don't bounce —
        // tapping them opens the overlay instead.
        const bounces = tile.def.kind === 'npc' || tile.def.kind === 'interactable';
        const bounce = bounces ? (getBounceOffsetPx?.(x, y) ?? 0) : 0;
        // R18: the house's two light sources cross-fade against each other
        // over dawn/dusk — lamps come up as daylight through the windows
        // goes down. Both are driven purely by `lighting.dayness` (day/night
        // clock, R19); nothing here reads or touches need state.
        if (lighting) {
          if (tile.def.name === 'lamp' && lighting.dayness < 1) {
            drawGlow(ctx, room, x, y, tile.def, LAMP_GLOW, 1 - lighting.dayness, 0, 0);
          } else if (tile.def.name === 'window' && lighting.dayness > 0) {
            const spill = daylightSpillDirection(room, x, y, tile.def);
            drawGlow(ctx, room, x, y, tile.def, DAYLIGHT_GLOW, lighting.dayness, spill.dx, spill.dy);
          }
        }
        drawObject(ctx, x, y, tile.def, bounce);
      }
    }
  }
}

interface GlowSpec {
  rgb: string;
  peakAlpha: number;
  radiusTiles: number;
}

// Warm interior bulb light; daylight is cooler, wider, and stronger because
// it's a whole wall opening rather than a single fixture.
const LAMP_GLOW: GlowSpec = { rgb: '255,224,140', peakAlpha: 0.55, radiusTiles: 1.6 };
const DAYLIGHT_GLOW: GlowSpec = { rgb: '255,250,225', peakAlpha: 0.42, radiusTiles: 3.2 };

/**
 * Which way daylight falls into the room from a window. Windows sit on the
 * floor tile against a wall (see objects.yaml), so the spill goes away from
 * whichever side the wall is on — derived from the actual grid rather than
 * assumed to be "downward", since a window on a left or right wall is just
 * as authorable and would otherwise light the wrong side.
 */
function daylightSpillDirection(
  room: RoomDef,
  tx: number,
  ty: number,
  def: ObjectDef,
): { dx: number; dy: number } {
  const [w, h] = def.footprint;
  const sides: Array<{ dx: number; dy: number; probe: [number, number] }> = [
    { dx: 0, dy: 1, probe: [tx, ty - 1] }, // wall above -> light falls down
    { dx: 0, dy: -1, probe: [tx, ty + h] },
    { dx: 1, dy: 0, probe: [tx - 1, ty] },
    { dx: -1, dy: 0, probe: [tx + w, ty] },
  ];
  for (const side of sides) {
    if (isWallAt(room, side.probe[0], side.probe[1])) return { dx: side.dx, dy: side.dy };
  }
  return { dx: 0, dy: 1 }; // free-standing window: fall back to "into the room"
}

/**
 * Soft radial light pool centred on an object's footprint, optionally pushed
 * one tile along (dirX, dirY) so a wall-mounted source lights the room rather
 * than the wall behind it. `strength` scales the whole thing so sources can
 * fade in and out across dawn/dusk instead of popping.
 *
 * Clipped to the floor tiles it can actually reach. Rooms are composited
 * edge-to-edge into one continuous scene (R1) and walls render as a thin
 * strip with the rest of the tile left as background, so an unclipped
 * gradient lights the black void outside the house — it reads as daylight
 * leaking through the walls. Clipping to floor rather than to the room's
 * bounding box also handles rooms whose outline isn't a plain rectangle
 * (the kitchen's stepped corner), and costs only the tiles the glow covers.
 */
function drawGlow(
  ctx: CanvasRenderingContext2D,
  room: RoomDef,
  tx: number,
  ty: number,
  def: ObjectDef,
  spec: GlowSpec,
  strength: number,
  dirX: number,
  dirY: number,
): void {
  const r = TILE_PX * spec.radiusTiles;
  const cx = tx * TILE_PX + (def.footprint[0] * TILE_PX) / 2 + dirX * TILE_PX;
  const cy = ty * TILE_PX + (def.footprint[1] * TILE_PX) / 2 + dirY * TILE_PX;
  const alpha = spec.peakAlpha * strength;

  ctx.save();
  ctx.beginPath();
  const minTx = Math.max(0, Math.floor((cx - r) / TILE_PX));
  const maxTx = Math.min(room.width - 1, Math.floor((cx + r) / TILE_PX));
  const minTy = Math.max(0, Math.floor((cy - r) / TILE_PX));
  const maxTy = Math.min(room.height - 1, Math.floor((cy + r) / TILE_PX));
  for (let y = minTy; y <= maxTy; y++) {
    for (let x = minTx; x <= maxTx; x++) {
      if (!isFloorishAt(room, x, y)) continue;
      ctx.rect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    }
  }
  ctx.clip();

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, `rgba(${spec.rgb},${alpha})`);
  gradient.addColorStop(1, `rgba(${spec.rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  def: ObjectDef,
  bounceOffsetPx: number,
): void {
  const px = tx * TILE_PX;
  const py = ty * TILE_PX + bounceOffsetPx;
  const w = def.footprint[0] * TILE_PX; // the actual on-screen/collision box
  const h = def.footprint[1] * TILE_PX;
  const cx = px + w / 2;
  const cy = py + h / 2;

  const flipX = def.flip === 'x' || def.flip === 'both';
  const flipY = def.flip === 'y' || def.flip === 'both';
  const angle = ((def.rotate ?? 0) * Math.PI) / 180;
  const swapped = def.rotate === 90 || def.rotate === 270;

  const transformed = flipX || flipY || angle !== 0;
  if (transformed) {
    ctx.save();
    ctx.translate(cx, cy);
    // Rotate called before scale so flip happens in the object's own frame
    // and rotate turns the (already-flipped) result — matches ObjectDef's
    // "rotate is applied after flip" doc.
    if (angle !== 0) ctx.rotate(angle);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.translate(-cx, -cy);
  }

  // For a 90/270 rotation, the box is drawn pre-rotation at swapped
  // dimensions (art wants w<->h) so that once the canvas rotation above is
  // applied, it exactly fills the real w x h footprint box.
  const drawW = swapped ? h : w;
  const drawH = swapped ? w : h;
  const drawPx = cx - drawW / 2;
  const drawPy = cy - drawH / 2;

  const asset = requestAsset(def.name);
  if (asset) {
    ctx.drawImage(asset, drawPx, drawPy, drawW, drawH);
  } else {
    const pad = 4;
    roundRect(ctx, drawPx + pad, drawPy + pad, drawW - pad * 2, drawH - pad * 2, 8);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawGlyph(ctx, def.name, drawPx, drawPy, drawW, drawH);
  }

  if (transformed) ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: string,
  px: number,
  py: number,
  w: number,
  h: number,
): void {
  const cx = px + w / 2;
  const cy = py + h / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;

  switch (name) {
    case 'toilet':
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * 0.22, h * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'shower':
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + w * (0.3 + i * 0.2), py + h * 0.3);
        ctx.lineTo(px + w * (0.3 + i * 0.2), py + h * 0.7);
        ctx.stroke();
      }
      break;
    case 'fridge':
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.18, cy - h * 0.22);
      ctx.lineTo(cx + w * 0.18, cy - h * 0.22);
      ctx.stroke();
      break;
    case 'mirror':
      roundRect(ctx, px + w * 0.2, py + h * 0.15, w * 0.6, h * 0.7, 6);
      ctx.stroke();
      break;
    case 'toybox':
      ctx.beginPath();
      ctx.moveTo(px + w * 0.2, py + h * 0.4);
      ctx.lineTo(px + w * 0.8, py + h * 0.4);
      ctx.stroke();
      break;
    case 'parent':
      ctx.beginPath();
      ctx.arc(cx, cy - h * 0.18, w * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'toy':
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(w, h) * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'lamp':
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.2, cy + h * 0.25);
      ctx.lineTo(cx + w * 0.2, cy + h * 0.25);
      ctx.lineTo(cx + w * 0.1, cy - h * 0.2);
      ctx.lineTo(cx - w * 0.1, cy - h * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case 'frame':
      roundRect(ctx, px + w * 0.25, py + h * 0.2, w * 0.5, h * 0.6, 4);
      ctx.stroke();
      break;
    default:
      break;
  }
}
