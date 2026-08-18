import { expect, test } from 'vitest';
import indexHtml from '../index.html?raw';
import { readSources } from './helpers/sourceScan';

/**
 * The remaining CLAUDE.md hard prohibitions that had no test of their own.
 * Each one is a rule that a perfectly reasonable-looking diff would break,
 * which is the stated reason the prohibitions exist as a list at all.
 */

const NEED_PRESENTATION_MODULES = [
  'render/renderNeedBubble.ts',
  'render/renderAvatar.ts',
  'ui/profileSwitcher.ts',
  'needs/needState.ts',
];

test('nothing anywhere draws text', () => {
  // "No instructional/navigational text. No labels, no tutorial copy, no
  // dialogue." The app is entirely code-drawn, so the whole rule reduces to:
  // no module may ever call into the canvas text API. (Letterforms as game
  // *content* — an alphabet mini-game, R17/P1 — would be a deliberate
  // exception to revisit here, and none exists yet.)
  const offenders: string[] = [];
  for (const file of readSources()) {
    if (/fillText|strokeText|measureText|\bctx\.font\b|font\s*=\s*['"`]/.test(file.code)) {
      offenders.push(file.path);
    }
  }
  expect(offenders).toEqual([]);
});

test('the page itself shows no text either', () => {
  // A label in index.html would bypass every canvas-level check above.
  const body = indexHtml.slice(indexHtml.indexOf('<body'), indexHtml.indexOf('</body>'));
  const visible = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
  expect(visible).toBe('');
});

test('needs are never rendered as a meter, bar, number, or word', () => {
  // "No meters/bars/numbers/words for needs. Needs render as pictures + body
  // language only." A bar is the easy accidental version of this: it looks
  // like ordinary UI in a diff.
  for (const path of NEED_PRESENTATION_MODULES) {
    const code = readSources().find((f) => f.path === path)!.code;
    expect(code, `${path} draws text`).not.toMatch(/fillText|strokeText/);
    // Numeric formatting is how a need would get turned into a readout.
    expect(code, `${path} formats a number for display`).not.toMatch(
      /toFixed|toLocaleString|Math\.round\([^)]*need/i,
    );
    // A need must never be turned into a magnitude in the first place.
    expect(code, `${path} derives a level/percentage from a need`).not.toMatch(
      /needLevel|needPercent|fillFraction|\bpercent\b|\bratio\b/i,
    );
  }
});

test('the need bubble shows one icon and nothing else', () => {
  const code = readSources().find((f) => f.path === 'render/renderNeedBubble.ts')!.code;
  // Whatever it draws, it is chosen by *which* need is active, never by how
  // long it has been active — that would be severity by another name.
  expect(code).toMatch(/need/);
  expect(code).not.toMatch(/elapsed|sinceMs|ageMs|duration/i);
});

test('nothing persists state across sessions', () => {
  // "Closing the app freezes all state, full stop. No Date.now() deltas
  // across sessions." Nothing is stored today, so that holds trivially. This
  // test exists so that adding persistence is a deliberate act: whoever does
  // it has to come here and confront the offline-decay rule, because a saved
  // timestamp plus a restore is exactly how decay gets reintroduced.
  const offenders: string[] = [];
  for (const file of readSources()) {
    if (/localStorage|sessionStorage|indexedDB|document\.cookie|caches\b/.test(file.code)) {
      offenders.push(file.path);
    }
  }
  expect(offenders).toEqual([]);
});

test('every full-screen state has a one-tap way out', () => {
  // "No locked doors / dead ends. Every door opens. Every state has a
  // one-tap exit." The two states that take over the whole screen are the
  // mini-game overlay and the parent gate.
  const main = readSources().find((f) => f.path === 'main.ts')!.code;
  const start = main.indexOf("addEventListener('pointerdown'");
  const end = main.indexOf("addEventListener('pointermove'");
  const handler = main.slice(start, end);

  // The gate closes on any tap at all, before anything else can consume it.
  const gateClose = handler.indexOf('gateOpen = false');
  expect(gateClose).toBeGreaterThan(-1);
  expect(handler.indexOf('if (miniGame)')).toBeGreaterThan(gateClose);

  // The mini-game's exit is tested before its own input handling, so it can
  // never be shadowed by a shape sitting under it.
  const exitTest = handler.indexOf('hitTestExit(');
  expect(exitTest).toBeGreaterThan(-1);
  expect(handler.indexOf('handleToyboxPointerDown(')).toBeGreaterThan(exitTest);
});

test('no scores, currency, levels, or progression anywhere', () => {
  const forbidden = [
    /\bhighScore\b|\bpoints\b|\bcoins?\b|\bcurrency\b|\bstars\b/i,
    /\bunlock/i,
    /\blevelUp\b|\bprogress(ion)?\b|\bachievement/i,
    /\bstreak\b|\bcombo\b|\bbonus\b/i,
  ];
  const offenders: string[] = [];
  for (const file of readSources()) {
    for (const pattern of forbidden) {
      if (pattern.test(file.code)) offenders.push(`${file.path} matches ${pattern}`);
    }
  }
  expect(offenders).toEqual([]);
});
