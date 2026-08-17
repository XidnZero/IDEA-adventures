import { loadWorld } from './world/loadWorld';
import type { Avatar } from './avatar/avatar';
import { AVATAR_PROFILES, createAvatar, tileCenterPx } from './avatar/avatar';
import { createDragState, stepDragSteer } from './movement/dragSteer';
import { startAutoWalk, isAutoWalkDone, stepAutoWalk, type AutoWalkState } from './movement/autoWalk';
import { findPath } from './movement/bfsPath';
import { advanceWalkPhase, updateAvatarRoomId } from './movement/shared';
import { createCamera, updateCamera, type CameraState } from './engine/camera';
import { findRoomAtWorldTile, getWorldBoundsPx, roomTileToWorldTile } from './world/worldGrid';
import { renderRoom } from './render/renderRoom';
import { renderAvatar } from './render/renderAvatar';
import type { Pose } from './avatar/sprite';
import { renderNeedBubble, hitTestNeedBubble } from './render/renderNeedBubble';
import { hitTestProfileSwitcher, renderProfileSwitcher } from './ui/profileSwitcher';
import { createTapResponseState, getTapResponseOffsetPx, triggerTapResponse } from './interaction/tapResponse';
import { addSparkle, createSparkleState, renderSparkles } from './interaction/sparkle';
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
import { getLightingState, type LightingState } from './engine/dayNight';
import { GATE_HOLD_MS, GATE_JITTER_PX, inGateZone, renderParentGate } from './ui/parentGate';
import { precacheArt, registerServiceWorker } from './engine/registerServiceWorker';

registerServiceWorker();

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);
const ctx = canvas.getContext('2d')!;

const world = loadWorld();
const worldBounds = getWorldBoundsPx(world);

// Make this session's art available offline from the very first visit (see
// precacheArt). Derived from the world's own legend, so new art in
// objects.yaml is covered automatically.
precacheArt([...new Set(Object.values(world.objects).map((o) => o.name))]);

const spawnRoom = world.rooms[SPAWN_ROOM];
const spawnWorldTile = roomTileToWorldTile(spawnRoom, spawnRoom.spawn[0], spawnRoom.spawn[1]);
const spawnCenter = tileCenterPx(spawnWorldTile.tx, spawnWorldTile.ty);

// Both avatars share world state from the start (R6) — switching who's
// active never resets or repositions the other one.
const avatars: Avatar[] = AVATAR_PROFILES.map((profile, i) =>
  createAvatar(profile, spawnRoom.id, spawnCenter.x + i * TILE_PX * 0.7, spawnCenter.y),
);
let activeIndex = 0;

const drag = createDragState();
const tapResponse = createTapResponseState();
const sparkles = createSparkleState();
// The mini-game draws in screen space with no camera transform (R17), so its
// bursts can't share the world-space list above — the coordinates mean
// different things.
const miniGameSparkles = createSparkleState();

let sessionMs = 0; // foreground play-time clock only (R13/R19) — never Date.now().
const needStates: AvatarNeedState[] = avatars.map(() => createNeedState(sessionMs));
const autoWalkStates: Array<AutoWalkState | null> = avatars.map(() => null);
// Recomputed each frame from actual movement, then consumed by the render
// pass below — both movement systems feed it, so it can't disagree with
// whichever one is driving.
const poses: Pose[] = avatars.map(() => 'idle');

// R17 mini-game shell: null = world is showing; otherwise the toybox-sort
// overlay owns all rendering and pointer input until its exit icon is tapped.
let miniGame: ToyboxSortState | null = null;

// R18/R19: lighting reads the device's real clock (see engine/dayNight.ts —
// the *only* module allowed to do that). Recomputed every frame from
// `new Date()`; deliberately never derived from or fed into `sessionMs`.
let lighting: LightingState = getLightingState();

// R20 parent gate: a side-channel that watches pointer state without ever
// altering normal drag-steer/tap behavior unless it actually fires. See
// docs/decisions.md for the exact gesture and its reasoning.
let gateHold: { startMs: number; startX: number; startY: number } | null = null;
let gateOpen = false;

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

// R1: a single persistent dead-zone camera, eased toward the active avatar
// whenever they cross the dead-zone threshold — see engine/camera.ts. Starts
// centered on spawn; frame() below keeps it updated every frame after that.
const camera: CameraState = createCamera(
  spawnCenter.x,
  spawnCenter.y,
  window.innerWidth,
  window.innerHeight,
);

function pointerToWorldPx(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
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

  // R20 parent gate: tracked as an independent side-channel, never
  // preempting anything below — a normal tap/drag in this corner still does
  // exactly what it would anywhere else. Only fires from main.ts's frame()
  // loop once held, unmoved, for GATE_HOLD_MS. Disabled while the mini-game
  // owns input (it has its own full-screen exit already).
  if (!miniGame && !gateOpen && inGateZone(screenX, screenY, rect.width, rect.height)) {
    gateHold = { startMs: performance.now(), startX: screenX, startY: screenY };
  } else {
    gateHold = null;
  }

  if (gateOpen) {
    // Tap anywhere to close — one-tap exit from every state (R10/CLAUDE.md).
    gateOpen = false;
    return;
  }

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
    // R8 applies inside the overlay too: a tap that lands on no shape would
    // otherwise do nothing at all. Only the exit glyph above is exempt, since
    // closing the overlay is already an unmistakable response.
    addSparkle(miniGameSparkles, screenX, screenY, performance.now());
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

  // R8 "no dead taps", unconditionally: every tap that reaches the world
  // layer sparkles where it landed, whether or not it also does something
  // else. Placed before all the branches below rather than in each of their
  // else-paths so there is no way to add a new branch that forgets it — a
  // tap on a wall, on the black void between rooms, or on a tile the avatar
  // can't reach otherwise produced nothing visible at all.
  addSparkle(sparkles, p.x, p.y, now);

  // Need-bubble tap (R9 auto-walk trigger): only the active avatar's bubble
  // is ever shown, so it's always exactly what's tappable — no dead taps.
  const activeNeed = needStates[activeIndex].active;
  if (hitTestNeedBubble(active, activeNeed, p.x, p.y, now) && activeNeed) {
    const target = findNeedTarget(world, activeNeed);
    if (target) {
      const from = { tx: Math.floor(active.x / TILE_PX), ty: Math.floor(active.y / TILE_PX) };
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
  const hit = findRoomAtWorldTile(world, Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX));
  const tile = hit?.room.grid[hit.ty]?.[hit.tx];
  if (hit && tile?.kind === 'object' && tile.isAnchor) {
    if (tile.def.kind === 'minigame') {
      miniGame = createToyboxSort();
      return;
    }
    if (tile.def.kind === 'npc' || tile.def.kind === 'interactable') {
      triggerTapResponse(tapResponse, hit.room.id, hit.tx, hit.ty, now);
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
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  // Any real movement cancels an in-progress gate hold — the gesture
  // requires sustained *stillness*, which ordinary drag-steering play never
  // produces (see docs/decisions.md).
  if (gateHold && Math.hypot(screenX - gateHold.startX, screenY - gateHold.startY) > GATE_JITTER_PX) {
    gateHold = null;
  }

  if (gateOpen) return;
  if (miniGame) {
    handleToyboxPointerMove(miniGame, screenX, screenY, rect.width, rect.height);
    return;
  }
  if (!drag.active) return;
  const p = pointerToWorldPx(e.clientX, e.clientY);
  drag.targetPxX = p.x;
  drag.targetPxY = p.y;
});
function releaseDrag(): void {
  // Releasing the pointer always cancels an in-progress gate hold — it must
  // stay pressed, unmoved, for the full duration.
  gateHold = null;
  if (gateOpen) return;
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
  sessionMs += dt * 1000; // foreground play-time clock only (R13/R19) — never Date.now().

  // R18/R19: recomputed from the device's real clock every frame, entirely
  // independent of `sessionMs` above — see engine/dayNight.ts.
  lighting = getLightingState();

  // R20: the gate only actually opens here, once a tracked hold (started in
  // pointerdown, cancellable by pointermove/pointerup) has survived
  // GATE_HOLD_MS untouched.
  if (gateHold && now - gateHold.startMs >= GATE_HOLD_MS) {
    gateOpen = true;
    gateHold = null;
    drag.active = false;
  }

  for (let i = 0; i < avatars.length; i++) {
    const avatar = avatars[i];
    const prevX = avatar.x;
    const prevY = avatar.y;

    if (i === activeIndex && drag.active) {
      stepDragSteer(world, avatar, drag, dt);
    } else if (autoWalkStates[i]) {
      stepAutoWalk(avatar, autoWalkStates[i]!, dt);
    }

    // R1: rooms are just regions of one continuous walkable grid now, so
    // there's no door-crossing event to hook — just keep this bookkeeping
    // field in sync with wherever the avatar's world position lands.
    updateAvatarRoomId(world, avatar);

    const movedPx = Math.hypot(avatar.x - prevX, avatar.y - prevY);
    const isMoving = movedPx > 0.01;
    // R5: pose follows whether the avatar actually moved this frame, not
    // whether a drag is held — an auto-walking avatar (R9, need-bubble
    // triggered) is walking just as much, and used to render as idle.
    poses[i] = isMoving ? 'walk' : 'idle';
    advanceWalkPhase(avatar, movedPx);
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
  const active = avatars[activeIndex];
  updateCamera(camera, active.x, active.y, rect.width, rect.height, worldBounds, dt);

  if (gateOpen) {
    // R20: placeholder panel, see docs/decisions.md — nothing else renders
    // underneath while it's up.
    renderParentGate(ctx, rect.width, rect.height);
  } else if (miniGame) {
    // Full-screen overlay (R17): world, avatars, need bubbles, and the
    // profile switcher are all hidden while it's open — it owns the screen.
    updateToyboxSort(miniGame, now);
    renderToyboxSort(ctx, miniGame, rect.width, rect.height, now);
    renderSparkles(ctx, miniGameSparkles, now); // screen space — no camera transform here
  } else {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.translate(-camera.x, -camera.y);

    // R1: every room in the house renders every frame, each translated to
    // its own position in the composited world grid — no per-room hard cut.
    // Cheap AABB cull against the viewport since there are only a handful of
    // rooms, but skips drawing anything currently off-screen.
    for (const room of Object.values(world.rooms)) {
      const originX = room.pos[0] * TILE_PX;
      const originY = room.pos[1] * TILE_PX;
      const roomPxW = room.width * TILE_PX;
      const roomPxH = room.height * TILE_PX;
      const onScreen =
        originX + roomPxW >= camera.x &&
        originX <= camera.x + rect.width &&
        originY + roomPxH >= camera.y &&
        originY <= camera.y + rect.height;
      if (!onScreen) continue;

      ctx.save();
      ctx.translate(originX, originY);
      renderRoom(
        ctx,
        room,
        (tx, ty) => getTapResponseOffsetPx(tapResponse, room.id, tx, ty, now),
        lighting,
      );
      ctx.restore();
    }

    for (let i = 0; i < avatars.length; i++) {
      renderAvatar(ctx, avatars[i], poses[i]);
    }
    const activeNeed = needStates[activeIndex].active;
    if (activeNeed) {
      renderNeedBubble(ctx, active, activeNeed, now);
    }

    // R8: drawn last inside the camera transform, so a burst sits on top of
    // whatever was tapped and stays pinned to that world spot.
    renderSparkles(ctx, sparkles, now);
    ctx.restore();

    // R18: flat ambient screen-space tint, drawn after the camera transform
    // is restored — it's uniform across the viewport, not tied to world
    // position, so it can never introduce parallax/camera drift (R1).
    ctx.save();
    ctx.fillStyle = `rgba(${lighting.r},${lighting.g},${lighting.b},${lighting.alpha})`;
    ctx.fillRect(0, 0, rect.width, rect.height);
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
