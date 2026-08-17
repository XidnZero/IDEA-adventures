/**
 * Reads every module under `src/` as text so tests can assert *structural*
 * properties of the codebase, not just runtime behaviour. Two of phase-1.md's
 * acceptance criteria (R19 clock separation, R14 no-fail-state) are claims
 * about what the source is allowed to contain at all — they can't be proven
 * by exercising the app, because the whole point is that no code path exists.
 *
 * Comments are stripped before matching. This project's source is heavily
 * commented with the very words these tests forbid ("never Date.now()", "no
 * distress"), so a raw text scan would fail on its own documentation. The
 * rule is about code, so the scan is about code.
 */

const sources = import.meta.glob('../../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface SourceFile {
  /** Path relative to `src/`, e.g. `engine/dayNight.ts`. */
  path: string;
  /** File contents with `//` and block comments removed. */
  code: string;
}

function stripComments(text: string): string {
  // Good enough for this codebase: no regex literals containing `//` or `/*`,
  // and no comment markers inside string literals. Both are worth re-checking
  // if this ever starts producing a surprising result.
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

export function readSources(): SourceFile[] {
  return Object.entries(sources)
    .map(([path, text]) => ({
      path: path.replace(/^.*\/src\//, ''),
      code: stripComments(text),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Files whose stripped code matches `pattern`, as `src/`-relative paths. */
export function filesMatching(pattern: RegExp): string[] {
  return readSources()
    .filter((f) => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(f.code))
    .map((f) => f.path);
}
