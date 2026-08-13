import { parse as parseYaml } from 'yaml';
import objectsYamlRaw from '../../world/objects.yaml?raw';
import stagesYamlRaw from '../../world/stages.yaml?raw';
import type { ObjectDef, StageDef, World } from './types';
import { parseRoomFile } from './roomLoader';

const roomFiles = import.meta.glob('../../world/rooms/*.room', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function loadWorld(): World {
  const objects = parseYaml(objectsYamlRaw) as Record<string, ObjectDef>;
  const stagesRaw = parseYaml(stagesYamlRaw) as Record<string, { rooms: string[] }>;

  const stages: Record<string, StageDef> = {};
  for (const [id, def] of Object.entries(stagesRaw)) {
    stages[id] = { id, rooms: def.rooms };
  }

  const rooms: World['rooms'] = {};
  for (const [path, text] of Object.entries(roomFiles)) {
    const filename = path.split('/').pop()!;
    const room = parseRoomFile(filename, text, objects);
    rooms[room.id] = room;
  }

  // Cross-room door consistency: every door's target room and target spawn
  // tile must actually exist, or a mistyped `to:`/`spawn:` fails silently at
  // the worst possible time (mid-walk, for a 2-3yo audience).
  for (const room of Object.values(rooms)) {
    for (const door of room.doors) {
      const target = rooms[door.to];
      if (!target) {
        throw new Error(`${room.id}: door targets unknown room "${door.to}"`);
      }
      const [sx, sy] = door.spawn;
      if (!target.walkable[sy]?.[sx]) {
        throw new Error(
          `${room.id}: door into "${door.to}" spawns at (${sx},${sy}), which is not walkable there`,
        );
      }
    }
  }

  for (const stage of Object.values(stages)) {
    for (const roomId of stage.rooms) {
      if (!rooms[roomId]) {
        throw new Error(`stage "${stage.id}" references unknown room "${roomId}"`);
      }
    }
  }

  return { objects, stages, rooms };
}
