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

  // Composited house layout (R1): every room's world-tile footprint must be
  // disjoint, since all rooms render together in one continuous coordinate
  // space with no per-room clipping — an overlap would mean two rooms drawn
  // on top of each other.
  const roomList = Object.values(rooms);
  for (let i = 0; i < roomList.length; i++) {
    for (let j = i + 1; j < roomList.length; j++) {
      const a = roomList[i];
      const b = roomList[j];
      const overlapX = a.pos[0] < b.pos[0] + b.width && b.pos[0] < a.pos[0] + a.width;
      const overlapY = a.pos[1] < b.pos[1] + b.height && b.pos[1] < a.pos[1] + a.height;
      if (overlapX && overlapY) {
        throw new Error(`rooms "${a.id}" and "${b.id}" overlap in world space`);
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
