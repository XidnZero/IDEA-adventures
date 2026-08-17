// `vitest/config` re-exports Vite's own defineConfig with the `test` key
// added — one config file, so tests and the app share the exact same
// resolution rules rather than drifting apart in a second one.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
  },
  // Vitest shares this config on purpose: the world is loaded through Vite's
  // `?raw` / `import.meta.glob` (see world/loadWorld.ts), so tests exercise
  // the real loader against the real room files rather than a parallel
  // fixture that could drift from what ships.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
