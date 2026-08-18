import { requestAsset } from '../engine/assets';
import type { Direction } from './avatar';

export type Pose = 'idle' | 'walk';
export type Layer = 'body' | 'clothing' | 'hair';

// Fixed draw order, bottom to top. Clothing swap is P2 and need-state poses
// are P1 (R11-14), but the layer split itself has to exist from commit 1 —
// CLAUDE.md: retrofitting layering later is expensive, building it flat now
// is a silent tax on every future asset.
export const LAYER_ORDER: Layer[] = ['body', 'clothing', 'hair'];

export interface AvatarPalette {
  body: string;
  clothing: string;
  hair: string;
}

export const POSES: Pose[] = ['idle', 'walk'];
export const FACINGS: Direction[] = ['down', 'up', 'left', 'right'];

export function layerAssetName(
  avatarId: string,
  layer: Layer,
  pose: Pose,
  facing: Direction,
): string {
  return `avatars/${avatarId}/${layer}/${pose}-${facing}`;
}

export function requestLayerAsset(
  avatarId: string,
  layer: Layer,
  pose: Pose,
  facing: Direction,
): HTMLImageElement | null {
  return requestAsset(layerAssetName(avatarId, layer, pose, facing));
}

/** Every asset slot an avatar can ever ask for: layer x pose x facing. */
export function avatarAssetNames(avatarId: string): string[] {
  const names: string[] = [];
  for (const layer of LAYER_ORDER) {
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        names.push(layerAssetName(avatarId, layer, pose, facing));
      }
    }
  }
  return names;
}

/**
 * Resolves every avatar slot once, at startup.
 *
 * Without this, a slot is probed the first time its exact (layer, pose,
 * facing) combination appears — i.e. *during play*, the moment the child
 * first turns a corner or starts walking. CLAUDE.md forbids network calls
 * during play and phase-1.md's R22 criterion says "zero network calls at
 * play time", so the lookups happen up front instead. This also makes the
 * avatar behave like every other visual slot: all object art is already
 * resolved on the first frame, because every room renders on frame one.
 *
 * The requests are same-origin, tiny, and one-time — `requestAsset` caches
 * the "missing" answer permanently, so a slot is never asked for twice.
 */
export function warmAvatarAssets(avatarIds: readonly string[]): void {
  for (const id of avatarIds) {
    for (const name of avatarAssetNames(id)) requestAsset(name);
  }
}
