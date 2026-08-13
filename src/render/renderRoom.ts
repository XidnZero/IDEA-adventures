import type { ObjectDef, RoomDef } from '../world/types';
import { TILE_PX } from '../engine/config';
import { requestAsset } from '../engine/assets';

const WALL_COLOR = '#5b4636';
const FLOOR_COLOR = '#f4ead9';
const DOOR_MAT_COLOR = '#d8c9a3';
const VOID_COLOR = '#000000';

export function renderRoom(
  ctx: CanvasRenderingContext2D,
  room: RoomDef,
  getBounceOffsetPx?: (tx: number, ty: number) => number,
): void {
  // Pass 1: base tiles. Object-covered tiles (anchor or footprint overflow)
  // sit on floor, so they're drawn as floor here too.
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const tile = room.grid[y][x];
      const px = x * TILE_PX;
      const py = y * TILE_PX;
      if (tile.kind === 'wall') {
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(px, py, TILE_PX, TILE_PX);
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
        const bounce = tile.def.kind === 'npc' ? (getBounceOffsetPx?.(x, y) ?? 0) : 0;
        drawObject(ctx, x, y, tile.def, bounce);
      }
    }
  }
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
  const w = def.footprint[0] * TILE_PX;
  const h = def.footprint[1] * TILE_PX;

  const asset = requestAsset(def.name);
  if (asset) {
    ctx.drawImage(asset, px, py, w, h);
    return;
  }

  const pad = 4;
  roundRect(ctx, px + pad, py + pad, w - pad * 2, h - pad * 2, 8);
  ctx.fillStyle = def.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawGlyph(ctx, def.name, px, py, w, h);
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
    default:
      break;
  }
}
