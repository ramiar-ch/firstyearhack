// carSpawns.ts - picks spots along real roads to park cars, near the spawn.

import type { LondonData } from './london';
import type { CollisionWorld } from './collision';

export interface CarSpawn {
  x: number;
  z: number;
  heading: number; // radians, same meaning as object.rotation.y
}

// Only park on proper roads (not footpaths or tiny service lanes).
const CAR_ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'trunk']);

export function findCarSpawns(
  data: LondonData,
  world: CollisionWorld,
  count = 12,
  minGap = 25, // metres between parked cars
): CarSpawn[] {
  const candidates: CarSpawn[] = [];

  for (const road of data.roads) {
    if (!CAR_ROADS.has(road.type)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 12) continue; // too short to park on
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // UK: drive on the LEFT. "Left" of direction (dx, dz) is (dz, -dx).
      const side = road.width / 4;
      const x = (ax + bx) / 2 + dz * side;
      const z = (az + bz) / 2 - dx * side;
      candidates.push({ x, z, heading: Math.atan2(-dx, -dz) });
    }
  }

  // Closest to the player spawn first, so there's always a car nearby.
  const { x: sx, z: sz } = data.spawn;
  const dist = (c: CarSpawn) => Math.hypot(c.x - sx, c.z - sz);
  candidates.sort((a, b) => dist(a) - dist(b));

  const chosen: CarSpawn[] = [];
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (dist(c) < 8) continue; // don't park on top of the player
    if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < minGap)) continue;
    if (world.isBlocked(c.x, c.z, 2)) continue; // road goes under a building
    chosen.push(c);
  }
  return chosen;
}
