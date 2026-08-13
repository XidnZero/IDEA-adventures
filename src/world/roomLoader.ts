import { parse as parseYaml } from 'yaml';
import type { DoorDef, ObjectDef, RoomDef, Tile } from './types';

/**
 * Parses one `.room` file: a YAML frontmatter header (id/stage/size/spawn/doors)
 * followed by the ASCII grid. Per R4, the grid only ever carries walls/floor/doors
 * and single-character object anchors — footprints are expanded here from
 * objects.yaml, never hand-drawn in the grid itself.
 */
export function parseRoomFile(
  filename: string,
  text: string,
  objects: Record<string, ObjectDef>,
): RoomDef {
  const trimmed = text.replace(/^﻿/, '').trim();
  const parts = trimmed.split(/^---\s*$/m);
  if (parts.length < 3) {
    throw new Error(`${filename}: expected "---" header ... "---" gridframe`);
  }
  const header = parseYaml(parts[1]) as {
    id: string;
    stage: string;
    size: string;
    spawn: [number, number];
    doors?: DoorDef[];
  };
  const gridText = parts.slice(2).join('---').replace(/^\n+|\n+$/g, '');
  const gridLines = gridText.split('\n').map((l) => l.replace(/\r$/, ''));

  const sizeMatch = /^(\d+)x(\d+)$/.exec(header.size);
  if (!sizeMatch) throw new Error(`${header.id}: bad size "${header.size}", expected WxH`);
  const width = Number(sizeMatch[1]);
  const height = Number(sizeMatch[2]);

  if (gridLines.length !== height) {
    throw new Error(
      `${header.id}: grid has ${gridLines.length} rows, header size says ${height}`,
    );
  }

  const doors = header.doors ?? [];
  const doorAt = new Map<string, DoorDef>();
  for (const d of doors) doorAt.set(`${d.at[0]},${d.at[1]}`, d);

  const grid: Tile[][] = [];
  const walkable: boolean[][] = [];

  for (let y = 0; y < height; y++) {
    const row = gridLines[y];
    if (row.length !== width) {
      throw new Error(
        `${header.id}: row ${y} has length ${row.length}, header size says width ${width}`,
      );
    }
    const tileRow: Tile[] = [];
    const walkRow: boolean[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === '#') {
        tileRow.push({ kind: 'wall' });
        walkRow.push(false);
      } else if (ch === ' ') {
        tileRow.push({ kind: 'void' });
        walkRow.push(false);
      } else if (ch === '.') {
        tileRow.push({ kind: 'floor' });
        walkRow.push(true);
      } else if (ch === 'D') {
        const door = doorAt.get(`${x},${y}`);
        if (!door) {
          throw new Error(`${header.id}: door char at (${x},${y}) has no matching doors[] entry`);
        }
        tileRow.push({ kind: 'door', door });
        walkRow.push(true);
      } else {
        const def = objects[ch];
        if (!def) {
          throw new Error(`${header.id}: unknown object char "${ch}" at (${x},${y})`);
        }
        tileRow.push({ kind: 'object', char: ch, def, isAnchor: true });
        walkRow.push(false);
      }
    }
    grid.push(tileRow);
    walkable.push(walkRow);
  }

  // Every declared door must land on an actual 'D' tile — catches typos in the header.
  for (const d of doors) {
    const [dx, dy] = d.at;
    const tile = grid[dy]?.[dx];
    if (!tile || tile.kind !== 'door') {
      throw new Error(`${header.id}: doors[] entry at (${dx},${dy}) has no 'D' char there`);
    }
  }

  // Expand object footprints from their anchor tile. Any tile a footprint covers
  // beyond the anchor must currently be plain floor — overlap onto a wall, door,
  // void, or another object is an authoring error, not something to silently resolve.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = grid[y][x];
      if (tile.kind !== 'object' || !tile.isAnchor) continue;
      const [w, h] = tile.def.footprint;
      for (let fy = 0; fy < h; fy++) {
        for (let fx = 0; fx < w; fx++) {
          if (fx === 0 && fy === 0) continue;
          const tx = x + fx;
          const ty = y + fy;
          if (tx >= width || ty >= height) {
            throw new Error(
              `${header.id}: object "${tile.def.name}" at (${x},${y}) footprint runs outside room bounds`,
            );
          }
          const covered = grid[ty][tx];
          if (covered.kind !== 'floor') {
            throw new Error(
              `${header.id}: object "${tile.def.name}" at (${x},${y}) footprint overlaps a non-floor tile at (${tx},${ty})`,
            );
          }
          grid[ty][tx] = { kind: 'object', char: tile.char, def: tile.def, isAnchor: false };
          walkable[ty][tx] = false;
        }
      }
    }
  }

  const spawnTile = grid[header.spawn[1]]?.[header.spawn[0]];
  if (!spawnTile || !walkable[header.spawn[1]][header.spawn[0]]) {
    throw new Error(`${header.id}: spawn (${header.spawn}) is not a walkable tile`);
  }

  return {
    id: header.id,
    stage: header.stage,
    width,
    height,
    spawn: header.spawn,
    doors,
    grid,
    walkable,
  };
}
