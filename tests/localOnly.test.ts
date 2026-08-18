import { expect, test } from 'vitest';
import { readSources } from './helpers/sourceScan';
import {
  avatarAssetNames,
  FACINGS,
  layerAssetName,
  LAYER_ORDER,
  POSES,
} from '../src/avatar/sprite';

/**
 * CLAUDE.md hard prohibition: "No network calls during play. Local-only. No
 * analytics, no ads, no accounts." Backed by phase-1.md's R21/R22 acceptance
 * criterion, "zero network calls at play time".
 *
 * This is the kind of rule that is easy to keep by accident and easy to break
 * by accident — one convenience import, one crash reporter, one font from a
 * CDN. It's checked structurally because the guarantee is about what the code
 * is *able* to do, not about what a particular play session happened to do.
 */

// Everything that can reach the network from a page. `fetch` is deliberately
// matched loosely: any identifier ending in "fetch" is worth a look.
const NETWORK_APIS = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
  /\bnavigator\.connection\b/,
  /\bimport\s*\(\s*['"`]https?:/,
];

// The one module allowed anywhere near the network layer, and even it only
// registers the worker and posts it a message — the actual fetching happens
// in public/sw.js, whose entire job is making the app work *without* a
// network. It is not part of play.
const SERVICE_WORKER_MODULE = 'engine/registerServiceWorker.ts';

test('no module can make a network call', () => {
  const offenders: string[] = [];
  for (const file of readSources()) {
    if (file.path === SERVICE_WORKER_MODULE) continue;
    for (const pattern of NETWORK_APIS) {
      if (pattern.test(file.code)) offenders.push(`${file.path} matches ${pattern}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('even the service-worker module only registers and posts a message', () => {
  const code = readSources().find((f) => f.path === SERVICE_WORKER_MODULE)!.code;
  for (const pattern of NETWORK_APIS) {
    expect(code, `${pattern} in the service-worker module`).not.toMatch(pattern);
  }
  expect(code).toMatch(/navigator\.serviceWorker/);
});

test('nothing reaches for a remote host', () => {
  // Catches a CDN script, a font, an image, or an analytics endpoint pasted
  // into a URL string, independent of which API would have loaded it.
  const offenders: string[] = [];
  for (const file of readSources()) {
    const urls = file.code.match(/https?:\/\/[^\s'"`]+/g) ?? [];
    for (const url of urls) {
      if (url.startsWith('http://localhost')) continue;
      offenders.push(`${file.path}: ${url}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('no analytics, ads, or account machinery anywhere', () => {
  const forbidden = [
    /\bgtag\b|\bdataLayer\b|googletagmanager/i,
    /\banalytics\b/i,
    /\bmixpanel\b|\bamplitude\b|\bsegment\.|\bposthog\b/i,
    /\bsentry\b|\bbugsnag\b/i,
    /\badsbygoogle\b|\badserver\b/i,
    /\bsignIn\b|\bsignUp\b|\blogin\b|\boauth\b|\bapiKey\b|\baccessToken\b/i,
  ];
  const offenders: string[] = [];
  for (const file of readSources()) {
    for (const pattern of forbidden) {
      if (pattern.test(file.code)) offenders.push(`${file.path} matches ${pattern}`);
    }
  }
  expect(offenders).toEqual([]);
});

test('every avatar art slot is resolved at startup, not mid-play', () => {
  // An asset slot is probed the first time it's asked for. Object art is all
  // asked for on frame one (every room renders), but an avatar slot is keyed
  // by pose and facing, so a lazily-probed slot is requested the moment the
  // child first turns a corner — i.e. during play, which is forbidden.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  expect(main).toMatch(/warmAvatarAssets\(/);

  // The warm-up must cover the full matrix, or the uncovered combinations go
  // back to being probed mid-play.
  const names = avatarAssetNames('kid1');
  expect(names).toHaveLength(LAYER_ORDER.length * POSES.length * FACINGS.length);
  expect(new Set(names).size).toBe(names.length);
  for (const layer of LAYER_ORDER) {
    for (const pose of POSES) {
      for (const facing of FACINGS) {
        expect(names).toContain(layerAssetName('kid1', layer, pose, facing));
      }
    }
  }

  // ...and the same list is what gets handed to the offline precache, so a
  // new pose or facing can't be covered in one place but not the other.
  expect(main).toMatch(/avatarAssetNames\(/);
  expect(main).toMatch(/precacheArt\(\[[\s\S]*avatarSlots/);
});

test('world data is bundled, not fetched', () => {
  // The rooms/objects/stages files are pulled in at build time via Vite's
  // ?raw imports. If that ever became a runtime load, the app would need the
  // network to start — which is exactly what R22 forbids.
  const loader = readSources().find((f) => f.path === 'world/loadWorld.ts')!.code;
  expect(loader).toMatch(/\?raw/);
  expect(loader).toMatch(/import\.meta\.glob/);
  for (const pattern of NETWORK_APIS) {
    expect(loader).not.toMatch(pattern);
  }
});
