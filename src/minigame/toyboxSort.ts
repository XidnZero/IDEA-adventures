/**
 * R17 mini-game shell + toybox sorting. Entered diegetically by tapping the
 * toybox object in the living room (world/objects.yaml: X, kind: 'minigame').
 * Full-screen overlay, rendered and driven entirely in screen space — no
 * camera, no world coordinates. Per R17/CLAUDE.md, a mini-game declares its
 * own input model; this one is drag-a-shape-into-a-matching-colour-bin,
 * which is NOT the world layer's drag-steering system (different code,
 * different meaning of "drag" — this one drags an object, not the avatar).
 *
 * No score, no timer-as-pressure, no wrong-answer state: a mismatched or
 * empty-space drop just calmly returns the shape to where it started. There
 * is no game-over — once every shape is sorted, bins glow briefly and a
 * fresh shuffled set appears, forever replayable.
 */

export type ShapeType = 'circle' | 'square' | 'triangle';

export interface ToyShape {
  id: string;
  color: string;
  shapeType: ShapeType;
  homeX: number; // normalized [0,1] position, relative to viewport
  homeY: number;
  x: number; // current normalized position (== home unless dragging/sorted)
  y: number;
  sorted: boolean;
  dragging: boolean;
  poppedAt: number | null; // ms timestamp; drives the delight pop-scale animation
}

export interface Bin {
  color: string;
  cx: number; // normalized center
  cy: number;
  w: number; // normalized size
  h: number;
}

export interface ToyboxSortState {
  shapes: ToyShape[];
  bins: Bin[];
  draggingId: string | null;
  dragDX: number; // px offset from shape center to pointer, captured at drag start
  dragDY: number;
  allDoneAt: number | null;
}

const BIN_COLORS = ['#e6594c', '#4c8fe6', '#4cc98c'];
const SHAPE_TYPES: ShapeType[] = ['circle', 'square', 'triangle'];

const SHAPE_DRAW_R = 40;
const SHAPE_TOUCH_R = 64; // >= ~120px touch target diameter (CLAUDE.md)
export const EXIT_RADIUS = 64;
const EXIT_MARGIN = 24;
const POP_MS = 320;
const ALL_DONE_MS = 1800;

function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeBins(): Bin[] {
  return BIN_COLORS.map((color, i) => ({
    color,
    cx: 0.2 + i * 0.3,
    cy: 0.86,
    w: 0.22,
    h: 0.2,
  }));
}

function randomHome(existing: ToyShape[]): { x: number; y: number } {
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = randRange(0.14, 0.86);
    const y = randRange(0.16, 0.6);
    if (existing.every((s) => Math.hypot(s.homeX - x, s.homeY - y) > 0.14)) return { x, y };
  }
  return { x: randRange(0.14, 0.86), y: randRange(0.16, 0.6) };
}

function makeShapes(): ToyShape[] {
  const shapes: ToyShape[] = [];
  let n = 0;
  for (const color of BIN_COLORS) {
    for (let i = 0; i < 2; i++) {
      const shapeType = SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)];
      const pos = randomHome(shapes);
      shapes.push({
        id: `s${n++}`,
        color,
        shapeType,
        homeX: pos.x,
        homeY: pos.y,
        x: pos.x,
        y: pos.y,
        sorted: false,
        dragging: false,
        poppedAt: null,
      });
    }
  }
  return shuffle(shapes);
}

export function createToyboxSort(): ToyboxSortState {
  return {
    shapes: makeShapes(),
    bins: makeBins(),
    draggingId: null,
    dragDX: 0,
    dragDY: 0,
    allDoneAt: null,
  };
}

function exitIconCenter(rectW: number): { x: number; y: number } {
  return { x: rectW - EXIT_MARGIN - EXIT_RADIUS, y: EXIT_MARGIN + EXIT_RADIUS };
}

/** Obvious, always-available, picture-only way out — not a text "Exit" button. */
export function hitTestExit(rectW: number, screenX: number, screenY: number): boolean {
  const c = exitIconCenter(rectW);
  return Math.hypot(screenX - c.x, screenY - c.y) <= EXIT_RADIUS;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Picks up the topmost unsorted shape under the pointer, if any. Always consumes the tap. */
export function handleToyboxPointerDown(
  state: ToyboxSortState,
  screenX: number,
  screenY: number,
  rectW: number,
  rectH: number,
): void {
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    if (s.sorted) continue;
    const px = s.x * rectW;
    const py = s.y * rectH;
    if (Math.hypot(screenX - px, screenY - py) <= SHAPE_TOUCH_R) {
      state.draggingId = s.id;
      s.dragging = true;
      state.dragDX = px - screenX;
      state.dragDY = py - screenY;
      // Bring to front (drawn/hit-tested last) while dragging.
      state.shapes.splice(i, 1);
      state.shapes.push(s);
      return;
    }
  }
}

export function handleToyboxPointerMove(
  state: ToyboxSortState,
  screenX: number,
  screenY: number,
  rectW: number,
  rectH: number,
): void {
  if (!state.draggingId) return;
  const s = state.shapes.find((sh) => sh.id === state.draggingId);
  if (!s) return;
  s.x = clamp((screenX + state.dragDX) / rectW, 0.04, 0.96);
  s.y = clamp((screenY + state.dragDY) / rectH, 0.06, 0.96);
}

/** Drop: matching bin sorts calmly with a pop animation; anything else just floats back home. Never a fail signal. */
export function handleToyboxPointerUp(
  state: ToyboxSortState,
  rectW: number,
  rectH: number,
  now: number,
): void {
  if (!state.draggingId) return;
  const s = state.shapes.find((sh) => sh.id === state.draggingId);
  state.draggingId = null;
  if (!s) return;
  s.dragging = false;

  const px = s.x * rectW;
  const py = s.y * rectH;
  const bin = state.bins.find((b) => {
    const bx = b.cx * rectW;
    const by = b.cy * rectH;
    const bw = b.w * rectW;
    const bh = b.h * rectH;
    return Math.abs(px - bx) <= bw * 0.75 && Math.abs(py - by) <= bh * 0.9;
  });

  if (bin && bin.color === s.color) {
    s.sorted = true;
    s.poppedAt = now;
    const sortedInBin = state.shapes.filter((sh) => sh.sorted && sh.color === s.color).length;
    s.x = bin.cx + (sortedInBin - 1.5) * 0.05;
    s.y = bin.cy - 0.02;
  } else {
    s.x = s.homeX;
    s.y = s.homeY;
  }

  if (state.shapes.every((sh) => sh.sorted)) {
    state.allDoneAt = now;
  }
}

/** Per-frame housekeeping: clears expired pop animations and reshuffles a fresh set after the calm "all done" pause. */
export function updateToyboxSort(state: ToyboxSortState, now: number): void {
  for (const s of state.shapes) {
    if (s.poppedAt !== null && now - s.poppedAt > POP_MS) s.poppedAt = null;
  }
  if (state.allDoneAt !== null && now - state.allDoneAt > ALL_DONE_MS) {
    state.shapes = makeShapes();
    state.bins = makeBins();
    state.allDoneAt = null;
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, s: ToyShape, px: number, py: number, r: number): void {
  ctx.fillStyle = s.color;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  switch (s.shapeType) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'square':
      ctx.beginPath();
      ctx.rect(px - r * 0.85, py - r * 0.85, r * 1.7, r * 1.7);
      ctx.fill();
      ctx.stroke();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r * 0.9, py + r * 0.75);
      ctx.lineTo(px - r * 0.9, py + r * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
  }
}

/** Pictorial door-arch glyph — the one-tap exit. No text, per CLAUDE.md. */
function drawExitGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy + r * 0.7);
  ctx.lineTo(cx - r * 0.55, cy - r * 0.1);
  ctx.arc(cx, cy - r * 0.1, r * 0.55, Math.PI, 0, false);
  ctx.lineTo(cx + r * 0.55, cy + r * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + r * 0.28, cy + r * 0.35, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
}

export function renderToyboxSort(
  ctx: CanvasRenderingContext2D,
  state: ToyboxSortState,
  rectW: number,
  rectH: number,
  now: number,
): void {
  ctx.fillStyle = '#fff6e6';
  ctx.fillRect(0, 0, rectW, rectH);

  for (const b of state.bins) {
    const bx = b.cx * rectW;
    const by = b.cy * rectH;
    const bw = b.w * rectW;
    const bh = b.h * rectH;
    roundRectPath(ctx, bx - bw / 2, by - bh / 2, bw, bh, 18);
    ctx.fillStyle = hexAlpha(b.color, 0.22);
    ctx.fill();
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 4;
    ctx.stroke();

    if (state.allDoneAt !== null) {
      const t = (now - state.allDoneAt) / ALL_DONE_MS;
      const glow = (Math.sin(t * Math.PI * 4) + 1) / 2;
      ctx.save();
      ctx.globalAlpha = 0.6 * glow;
      roundRectPath(ctx, bx - bw / 2 - 6, by - bh / 2 - 6, bw + 12, bh + 12, 22);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const s of state.shapes) {
    const px = s.x * rectW;
    const py = s.y * rectH;
    let scale = 1;
    if (s.poppedAt !== null) {
      const elapsed = now - s.poppedAt;
      scale = 1 + Math.sin(clamp(elapsed / POP_MS, 0, 1) * Math.PI) * 0.4;
    }
    drawShape(ctx, s, px, py, SHAPE_DRAW_R * scale);
  }

  const c = exitIconCenter(rectW);
  ctx.beginPath();
  ctx.arc(c.x, c.y, EXIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawExitGlyph(ctx, c.x, c.y, EXIT_RADIUS * 0.5);
}
