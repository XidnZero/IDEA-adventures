/**
 * Art pipeline fallback (CLAUDE.md): every visual slot checks for a real
 * asset file first and silently falls back to a code-drawn placeholder if
 * it's missing. Checked once per name and cached — never hard-fails, never
 * blank-renders, and a dropped-in file swaps in with zero code change since
 * callers just re-request the same name.
 *
 * Extensions are tried in order and the first one that decodes wins. SVG is
 * tried first because the authored art is vector: the world renders at a
 * single TILE_PX today, but an object's on-screen size is derived from its
 * tile footprint, so a raster asset would have to be re-exported for every
 * footprint/zoom combination while one SVG covers all of them. A missing
 * file is not an error at any step — it just advances to the next candidate,
 * and running out of candidates is the ordinary "no art yet" case.
 */

const EXTENSIONS = ['svg', 'png'] as const;

type AssetState =
  | { status: 'loading' }
  | { status: 'ready'; img: HTMLImageElement }
  | { status: 'missing' };

const cache = new Map<string, AssetState>();

function tryLoad(name: string, extIndex: number): void {
  const img = new Image();
  img.onload = () => cache.set(name, { status: 'ready', img });
  img.onerror = () => {
    const next = extIndex + 1;
    if (next < EXTENSIONS.length) tryLoad(name, next);
    else cache.set(name, { status: 'missing' });
  };
  img.src = `/assets/${name}.${EXTENSIONS[extIndex]}`;
}

export function requestAsset(name: string): HTMLImageElement | null {
  const cached = cache.get(name);
  if (cached?.status === 'ready') return cached.img;
  if (cached) return null; // loading or known-missing: draw the placeholder

  cache.set(name, { status: 'loading' });
  tryLoad(name, 0);
  return null;
}
