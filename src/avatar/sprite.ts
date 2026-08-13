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

export function requestLayerAsset(
  avatarId: string,
  layer: Layer,
  pose: Pose,
  facing: Direction,
): HTMLImageElement | null {
  return requestAsset(`avatars/${avatarId}/${layer}/${pose}-${facing}`);
}
