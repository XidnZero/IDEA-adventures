import { loadWorld } from './world/loadWorld';
import type { Avatar } from './avatar/avatar';
import { AVATAR_PROFILES, createAvatar, tileCenterPx } from './avatar/avatar';
import { createDragState, stepDragSteer } from './movement/dragSteer';
import { startAutoWalk, isAutoWalkDone, stepAutoWalk, type AutoWalkState } from './movement/autoWalk';
import { findPath } from './movement/bfsPath';
import { computeCameraOffset } from './engine/camera';
import { renderRoom } from './render/renderRoom';
import { renderAvatar } from './render/renderAvatar';
import { renderNeedBubble, hitTestNeedBubble } from './render/renderNeedBubble';
import { hitTestProfileSwitcher, renderProfileSwitcher } from './ui/profileSwitcher';
import { createTapResponseState, getTapResponseOffsetPx, triggerTapResponse } from './interaction/tapResponse';
import { createNeedState, advanceNeedState, resolveNeed, type AvatarNeedState } from './needs/needState';
import { findNeedTarget } from './needs/needTargets';
import { SPAWN_ROOM, TILE_PX } from './engine/config';
import {
  createToyboxSort,
  handleToyboxPointerDown,
  handleToyboxPointerMove,
  handleToyboxPointerUp,
  hitTestExit,
  renderToyboxSort,
  updateToyboxSort,
  type ToyboxSortState,
} from './minigame/toyboxSort';

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
const tapResponse = createTapResponseState();

let sessionMs = 0; // foreground play-time clock only (R13/R19) — never Date.now().
const needStates: AvatarNeedState[] = avatars.map(() => createNeedState(sessionMs));
const autoWalkStates: Array<AutoWalkState | null> = avatars.map(() => null);

// R17 mini-game shell: null = world is showing; otherwise the toybox-sort
// overlay owns all rendering and pointer input until its exit icon is tapped.
let miniGame: ToyboxSortState | null = null;

// Light-touch R15: a parent NPC in the room where a need resolves bounces
// in place. Parents are static (R7 — no pathfinding), so this stands in for
// "comes over" without literally moving the NPC across the room.
function celebrateInRoom(roomId: string, now: number): void {
  const room = world.rooms[roomId];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const tile = room.grid[y][x];
      if (tile.kind === 'object' && tile.isAnchor && tile.def.kind === 'npc') {
        triggerTapResponse(tapResponse, roomId, x, y, now);
        return;
      }
    }
  }
}

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
// single-tap-to-point. A tap on a profile portrait, a need bubble, or a
// parent NPC is handled first and consumes the pointer instead of starting
// a drag underneath it.
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // R17 mini-game overlay: while open, it owns all input. Its own input
  // model (drag-a-shape) is declared entirely inside toyboxSort.ts — this is
  // NOT the world layer's drag-steering. The exit icon is the one obvious,
  // always-available, picture-only way back out (no locked doors, CLAUDE.md).
  if (miniGame) {
    if (hitTestExit(rect.width, screenX, screenY)) {
      miniGame = null;
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    handleToyboxPointerDown(miniGame, screenX, screenY, rect.width, rect.height);
    return;
  }

  const picked = hitTestProfileSwitcher(avatars, screenX, screenY);
  if (picked !== null) {
    activeIndex = picked;
    drag.active = false;
    return;
  }

  const p = pointerToWorldPx(e.clientX, e.clientY);
  const active = avatars[activeIndex];
  const now = performance.now();

  // Need-bubble tap (R9 auto-walk trigger): only the active avatar's bubble
  // is ever shown, so it's always exactly what's tappable — no dead taps.
  const activeNeed = needStates[activeIndex].active;
  if (hitTestNeedBubble(active, activeNeed, p.x, p.y, now) && activeNeed) {
    const target = findNeedTarget(world, activeNeed);
    if (target) {
      const from = {
        roomId: active.roomId,
        tx: Math.floor(active.x / TILE_PX),
        ty: Math.floor(active.y / TILE_PX),
      };
      const path = findPath(world, from, target);
      if (path) {
        autoWalkStates[activeIndex] = startAutoWalk(path);
        drag.active = false;
      }
    }
    return;
  }

  // Object tap: parent NPCs (R7) and interactables (R16) share the same
  // retriggerable bounce response instead of starting a drag-walk; the
  // toybox (R17) instead launches the mini-game overlay diegetically.
  const room = world.rooms[active.roomId];
  const tx = Math.floor(p.x / TILE_PX);
  const ty = Math.floor(p.y / TILE_PX);
  const tile = room.grid[ty]?.[tx];
  if (tile?.kind === 'object' && tile.isAnchor) {
    if (tile.def.kind === 'minigame') {
      miniGame = createToyboxSort();
      return;
    }
    if (tile.def.kind === 'npc' || tile.def.kind === 'interactable') {
      triggerTapResponse(tapResponse, room.id, tx, ty, now);
      return;
    }
  }

  canvas.setPointerCapture(e.pointerId);
  autoWalkStates[activeIndex] = null; // manual control always takes over from auto-walk
  drag.active = true;
  drag.targetPxX = p.x;
  drag.targetPxY = p.y;
});
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  if (miniGame) {
    handleToyboxPointerMove(miniGame, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    return;
  }
  if (!drag.active) return;
  const p = pointerToWorldPx(e.clientX, e.clientY);
  drag.targetPxX = p.x;
  drag.targetPxY = p.y;
});
function releaseDrag(): void {
  if (miniGame) {
    const rect = canvas.getBoundingClientRect();
    handleToyboxPointerUp(miniGame, rect.width, rect.height, performance.now());
    return;
  }
  drag.active = false;
}
canvas.addEventListener('pointerup', releaseDrag);
canvas.addEventListener('pointercancel', releaseDrag);
canvas.addEventListener('pointerleave', releaseDrag);

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  sessionMs += dt * 1000;

  for (let i = 0; i < avatars.length; i++) {
    const avatar = avatars[i];
    const prevX = avatar.x;
    const prevY = avatar.y;

    if (i === activeIndex && drag.active) {
      stepDragSteer(world, avatar, drag, dt);
    } else if (autoWalkStates[i]) {
      stepAutoWalk(world, avatar, autoWalkStates[i]!, dt);
    }

    const isMoving = Math.hypot(avatar.x - prevX, avatar.y - prevY) > 0.01;
    advanceNeedState(needStates[i], sessionMs, dt, isMoving);

    const walk = autoWalkStates[i];
    if (walk && isAutoWalkDone(walk)) {
      if (needStates[i].active !== null) {
        resolveNeed(needStates[i], sessionMs);
        celebrateInRoom(avatar.roomId, now);
      }
      autoWalkStates[i] = null;
    }
  }

  const rect = canvas.getBoundingClientRect();

  if (miniGame) {
    // Full-screen overlay (R17): world, avatars, need bubbles, and the
    // profile switcher are all hidden while it's open — it owns the screen.
    updateToyboxSort(miniGame, now);
    renderToyboxSort(ctx, miniGame, rect.width, rect.height, now);
  } else {
    const active = avatars[activeIndex];
    const room = world.rooms[active.roomId];
    const camera = cameraForActive(rect.width, rect.height);

    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.translate(-camera.x, -camera.y);
    renderRoom(ctx, room, (tx, ty) => getTapResponseOffsetPx(tapResponse, room.id, tx, ty, now));
    for (let i = 0; i < avatars.length; i++) {
      const avatar = avatars[i];
      if (avatar.roomId !== active.roomId) continue;
      const pose = i === activeIndex && drag.active ? 'walk' : 'idle';
      renderAvatar(ctx, avatar, pose);
    }
    const activeNeed = needStates[activeIndex].active;
    if (activeNeed) {
      renderNeedBubble(ctx, active, activeNeed, now);
    }
    ctx.restore();

    renderProfileSwitcher(
      ctx,
      avatars,
      activeIndex,
      needStates.map((s) => s.active),
    );
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
