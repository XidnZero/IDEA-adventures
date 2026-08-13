import type { World } from '../world/types';

export interface PathNode {
  roomId: string;
  tx: number;
  ty: number;
}

/**
 * BFS waypoint pathing (R9), for need-bubble auto-walk. Deliberately not
 * wired to any input yet — the need system it serves (R11-14) doesn't exist
 * in the world yet. Kept as a standalone, pure module (no shared state with
 * dragSteer.ts) per the movement-split decision in docs/decisions.md, ready
 * to wire up once need bubbles exist.
 */
export function findPath(world: World, from: PathNode, to: PathNode): PathNode[] | null {
  const key = (n: PathNode) => `${n.roomId}:${n.tx},${n.ty}`;

  if (from.roomId === to.roomId && from.tx === to.tx && from.ty === to.ty) {
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
      if (next.roomId === to.roomId && next.tx === to.tx && next.ty === to.ty) {
        return reconstruct(cameFrom, next, key);
      }
      queue.push(next);
    }
  }
  return null;
}

function neighbors(world: World, node: PathNode): PathNode[] {
  const room = world.rooms[node.roomId];
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
    if (ty < 0 || ty >= room.height || tx < 0 || tx >= room.width) continue;
    if (!room.walkable[ty][tx]) continue;
    out.push({ roomId: room.id, tx, ty });
  }

  // A door tile is also an edge straight into the destination room's spawn
  // point, the same way walking onto a doorway carries you through it.
  const tile = room.grid[node.ty]?.[node.tx];
  if (tile?.kind === 'door') {
    out.push({ roomId: tile.door.to, tx: tile.door.spawn[0], ty: tile.door.spawn[1] });
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
