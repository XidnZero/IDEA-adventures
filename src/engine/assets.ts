/**
 * Art pipeline fallback (CLAUDE.md): every visual slot checks for a real
 * asset file first and silently falls back to a code-drawn placeholder if
 * it's missing. Checked once per path and cached — never hard-fails, never
 * blank-renders, and a dropped-in file swaps in with zero code change since
 * callers just re-request the same path.
 */

type AssetState = { status: 'loading' } | { status: 'ready'; img: HTMLImageElement } | { status: 'missing' };

const cache = new Map<string, AssetState>();

export function requestAsset(name: string): HTMLImageElement | null {
  const path = `/assets/${name}.png`;
  const cached = cache.get(path);
  if (cached?.status === 'ready') return cached.img;
  if (cached) return null;

  cache.set(path, { status: 'loading' });
  const img = new Image();
  img.onload = () => cache.set(path, { status: 'ready', img });
  img.onerror = () => cache.set(path, { status: 'missing' });
  img.src = path;
  return null;
}
