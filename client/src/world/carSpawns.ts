// carSpawns.ts - picks spots along real roads to park cars, near the spawn.

import type { LondonData } from './data';
import type { CollisionWorld } from './collision';

export interface CarSpawn {
  x: number;
  z: number;
  heading: number; // radians, same meaning as object.rotation.y
}

// Normal parked cars only go on proper roads (not footpaths or service lanes).
const CAR_ROADS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'trunk']);
// The Strand outside KCL is pedestrianised in real life (since 2022), so the
// "your car" next to the spawn is also allowed on pedestrian streets.
const SPAWN_CAR_ROADS = new Set([...CAR_ROADS, 'pedestrian', 'service']);

/** Possible parking spots: every 10 m along the left side of matching roads. */
function parkingSpots(data: LondonData, types: Set<string>): CarSpawn[] {
  const spots: CarSpawn[] = [];
  for (const road of data.roads) {
    if (!types.has(road.type)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 12) continue; // too short to park on
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      // UK: drive on the LEFT. "Left" of direction (dx, dz) is (dz, -dx).
      const side = road.width / 4;
      for (let t = 6; t < len - 6; t += 10) {
        spots.push({
          x: ax + dx * t + dz * side,
          z: az + dz * t - dx * side,
          heading: Math.atan2(-dx, -dz),
        });
      }
    }
  }
  return spots;
}

export function findCarSpawns(
  data: LondonData,
  world: CollisionWorld,
  count = 12,
  minGap = 25, // metres between parked cars
): CarSpawn[] {
  // Closest to the player spawn first.
  const { x: sx, z: sz } = data.spawn;
  const dist = (c: CarSpawn) => Math.hypot(c.x - sx, c.z - sz);
  const byDistance = (spots: CarSpawn[]) => spots.sort((a, b) => dist(a) - dist(b));
  const usable = (c: CarSpawn) =>
    dist(c) >= 8 && // don't park on top of the player
    !world.isBlocked(c.x, c.z, 2); // road goes under a building

  const chosen: CarSpawn[] = [];

  // 1. "Your" car: the closest spot to the spawn on any road, even pedestrian.
  const first = byDistance(parkingSpots(data, SPAWN_CAR_ROADS)).find(usable);
  if (first) chosen.push(first);

  // 2. The rest: normal roads, spread out.
  for (const c of byDistance(parkingSpots(data, CAR_ROADS))) {
    if (chosen.length >= count) break;
    if (!usable(c)) continue;
    if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < minGap)) continue;
    chosen.push(c);
  }
  return chosen;
}
