import { loadWorld } from './world/loadWorld';
import type { Avatar } from './avatar/avatar';
import { AVATAR_PROFILES, createAvatar, tileCenterPx } from './avatar/avatar';
import { createDragState, stepDragSteer } from './movement/dragSteer';
import { computeCameraOffset } from './engine/camera';
import { renderRoom } from './render/renderRoom';
import { renderAvatar } from './render/renderAvatar';
import { hitTestProfileSwitcher, renderProfileSwitcher } from './ui/profileSwitcher';
import { SPAWN_ROOM, TILE_PX } from './engine/config';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

const world = loadWorld();

const spawnRoom = world.rooms[SPAWN_ROOM];
const spawnCenter = tileCenterPx(spawnRoom.spawn[0], spawnRoom.spawn[1]);

// Both avatars share world state from the start (R6) — switching who's
// active never resets or repositions the other one.
const avatars: Avatar[] = AVATAR_PROFILES.map((profile, i) =>
  createAvatar(profile, spawnRoom.id, spawnCenter.x + i * TILE_PX * 0.7, spawnCenter.y),
);
let activeIndex = 0;

const drag = createDragState();

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function cameraForActive(viewportW: number, viewportH: number): { x: number; y: number } {
  const active = avatars[activeIndex];
  const room = world.rooms[active.roomId];
  return computeCameraOffset(active.x, active.y, room.width * TILE_PX, room.height * TILE_PX, viewportW, viewportH);
}

function pointerToWorldPx(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const camera = cameraForActive(rect.width, rect.height);
  return { x: clientX - rect.left + camera.x, y: clientY - rect.top + camera.y };
}

// Hold-and-drag: press anywhere in the world and the active avatar
// continuously walks toward the pointer while held (R8) — not
// single-tap-to-point. A tap on a profile portrait is handled first and
// consumes the pointer instead of starting a drag underneath it.
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  const picked = hitTestProfileSwitcher(avatars, screenX, screenY);
  if (picked !== null) {
    activeIndex = picked;
    drag.active = false;
    return;
  }

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

  const active = avatars[activeIndex];
  stepDragSteer(world, active, drag, dt);

  const room = world.rooms[active.roomId];
  const rect = canvas.getBoundingClientRect();
  const camera = cameraForActive(rect.width, rect.height);

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.translate(-camera.x, -camera.y);
  renderRoom(ctx, room);
  for (let i = 0; i < avatars.length; i++) {
    const avatar = avatars[i];
    if (avatar.roomId !== active.roomId) continue;
    const pose = i === activeIndex && drag.active ? 'walk' : 'idle';
    renderAvatar(ctx, avatar, pose);
  }
  ctx.restore();

  renderProfileSwitcher(ctx, avatars, activeIndex);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
