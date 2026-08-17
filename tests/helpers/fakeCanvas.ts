/**
 * A recording stand-in for CanvasRenderingContext2D. The render modules are
 * pure "issue draw calls" code with no readback, so a recorder is enough to
 * assert what they drew — no headless browser needed for the art-pipeline
 * acceptance criteria.
 */
export interface FakeCtx {
  calls: Array<{ method: string; args: unknown[] }>;
  count(method: string): number;
  ctx: CanvasRenderingContext2D;
}

const GRADIENT = {
  addColorStop() {},
};

export function createFakeCtx(): FakeCtx {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const props: Record<string, unknown> = {};

  const target = {} as Record<string, unknown>;
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop in props) return props[prop];
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return GRADIENT;
        return undefined;
      };
    },
    set(_t, prop: string, value: unknown) {
      props[prop] = value;
      calls.push({ method: `set:${prop}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  return {
    calls,
    count: (method: string) => calls.filter((c) => c.method === method).length,
    ctx,
  };
}

/**
 * Installs a fake `Image` for `src/engine/assets.ts` to use.
 *
 * `available` decides which `/assets/<name>.<ext>` URLs "exist": a hit fires
 * `onload`, a miss fires `onerror` (which is exactly how a real missing file
 * behaves — see assets.ts). Both fire synchronously on assignment to `src`,
 * so a second `requestAsset()` call in the same tick sees the resolved state.
 */
export function installFakeImage(available: (src: string) => boolean): () => void {
  const previous = (globalThis as Record<string, unknown>).Image;

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = '';
    set src(value: string) {
      this.#src = value;
      if (available(value)) this.onload?.();
      else this.onerror?.();
    }
    get src(): string {
      return this.#src;
    }
  }

  (globalThis as Record<string, unknown>).Image = FakeImage;
  return () => {
    (globalThis as Record<string, unknown>).Image = previous;
  };
}
