/**
 * R21/R22 — installable PWA + offline. Registers the cache-first service
 * worker (public/sw.js) so the app keeps working with zero network calls
 * once it has been loaded at least once while online. This module only
 * touches `navigator.serviceWorker`; it has no clock of any kind and no
 * bearing on R19's clock-separation wall.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Never block or degrade play if registration fails (e.g. unsupported
      // context) — offline install is additive, not load-bearing for R1-R20.
    });
  });
}
