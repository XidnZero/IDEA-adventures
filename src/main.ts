import { loadWorld } from './world/loadWorld';
import type { Avatar } from './avatar/avatar';
import { tileCenterPx } from './avatar/avatar';
import { createDragState, stepDragSteer } from './movement/dragSteer';
import { computeCameraOffset } from './engine/camera';
import { renderRoom } from './render/renderRoom';
import { renderAvatar } from './render/renderAvatar';
import { SPAWN_ROOM, TILE_PX } from './engine/config';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

const world = loadWorld();

const spawnRoom = world.rooms[SPAWN_ROOM];
const spawnCenter = tileCenterPx(spawnRoom.spawn[0], spawnRoom.spawn[1]);

const avatar: Avatar = {
  id: 'kid1',
  color: '#5aa9c9',
  roomId: spawnRoom.id,
  x: spawnCenter.x,
  y: spawnCenter.y,
  facing: 'down',
};

const drag = createDragState();

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function pointerToWorldPx(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const room = world.rooms[avatar.roomId];
  const viewportW = rect.width;
  const viewportH = rect.height;
  const camera = computeCameraOffset(
    avatar.x,
    avatar.y,
    room.width * TILE_PX,
    room.height * TILE_PX,
    viewportW,
    viewportH,
  );
  return { x: clientX - rect.left + camera.x, y: clientY - rect.top + camera.y };
}

// Hold-and-drag: press anywhere in the world and the avatar continuously
// walks toward the pointer while held (R8) — not single-tap-to-point.
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = pointerToWorldPx(e.clientX, e.clientY);
  drag.active = true;
  drag.targetPxX = p.x;
  drag.targetPxY = p.y;
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag.active) return;
  const p = pointerToWorldPx(e.clientX, e.clientY);
  drag.targetPxX = p.x;
  drag.targetPxY = p.y;
});
function releaseDrag(): void {
  drag.active = false;
}
canvas.addEventListener('pointerup', releaseDrag);
canvas.addEventListener('pointercancel', releaseDrag);
canvas.addEventListener('pointerleave', releaseDrag);

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  stepDragSteer(world, avatar, drag, dt);

  const room = world.rooms[avatar.roomId];
  const rect = canvas.getBoundingClientRect();
  const camera = computeCameraOffset(
    avatar.x,
    avatar.y,
    room.width * TILE_PX,
    room.height * TILE_PX,
    rect.width,
    rect.height,
  );

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.translate(-camera.x, -camera.y);
  renderRoom(ctx, room);
  renderAvatar(ctx, avatar);
  ctx.restore();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
