import type { World } from '../world/types';
import { isWalkableWorldTile } from '../world/worldGrid';

export interface PathNode {
  tx: number;
  ty: number;
}

/**
 * BFS waypoint pathing (R9), for need-bubble auto-walk. Operates directly on
 * the composited house-wide world tile grid (R1) — rooms are just regions of
 * one continuous walkable grid now, so there's no special-casing for
 * crossing between them, unlike the old per-room-graph-plus-door-edges
 * version this replaced (see docs/decisions.md).
 */
export function findPath(world: World, from: PathNode, to: PathNode): PathNode[] | null {
  const key = (n: PathNode) => `${n.tx},${n.ty}`;

  if (from.tx === to.tx && from.ty === to.ty) {
    return [from];
  }

  const visited = new Set<string>([key(from)]);
  const queue: PathNode[] = [from];
  const cameFrom = new Map<string, PathNode>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of neighbors(world, current)) {
      const k = key(next);
      if (visited.has(k)) continue;
      visited.add(k);
      cameFrom.set(k, current);
      if (next.tx === to.tx && next.ty === to.ty) {
        return reconstruct(cameFrom, next, key);
      }
      queue.push(next);
    }
  }
  return null;
}

function neighbors(world: World, node: PathNode): PathNode[] {
  const out: PathNode[] = [];
  const deltas: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of deltas) {
    const tx = node.tx + dx;
    const ty = node.ty + dy;
    if (isWalkableWorldTile(world, tx, ty)) {
      out.push({ tx, ty });
    }
  }
  return out;
}

function reconstruct(
  cameFrom: Map<string, PathNode>,
  end: PathNode,
  key: (n: PathNode) => string,
): PathNode[] {
  const path: PathNode[] = [end];
  let cur = end;
  for (;;) {
    const prev = cameFrom.get(key(cur));
    if (!prev) break;
    path.push(prev);
    cur = prev;
  }
  return path.reverse();
}
