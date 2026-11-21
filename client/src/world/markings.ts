// markings.ts - white dashed centre lines, double yellow lines, zebra crossings.
// All markings of one colour are merged into a single mesh.

import * as THREE from 'three';
import { isStreet, nearestStreet, type LondonData, type Point, type Road } from './data';
import { addSegment, flatMesh, polylineLength, walkAlong } from './geometry';

const Y = 0.135; // just above the road surface
const TRIM = 8; // metres left clear at each end of a road (that's where junctions are)

export interface Zebra {
  x: number;
  z: number;
  dx: number; // road direction at the crossing
  dz: number;
  halfWidth: number; // half the road width
}

export function createMarkings(data: LondonData, near: { x: number; z: number }) {
  const white: number[] = [];
  const yellow: number[] = [];

  for (const road of data.roads) {
    if (!isStreet(road)) continue;
    const half = road.width / 2;
    const len = polylineLength(road.points);
    if (len < TRIM * 2 + 4) continue;

    // White dashed centre line: 3 m dash every 9 m (two-way roads, wide enough).
    if (!road.oneway && road.width >= 7) {
      walkAlong(road.points, 9, TRIM, (x, z, dx, dz, d) => {
        if (d > len - TRIM - 3) return;
        addSegment(white, [x, z], [x + dx * 3, z + dz * 3], 0.08, Y);
      });
    }

    // Double yellow lines (no parking!) along both edges, as short pieces so
    // they follow curves. Two thin lines 20 cm apart on each side. Not on bridges.
    if (!road.bridge) walkAlong(road.points, 4, TRIM, (x, z, dx, dz, d) => {
      if (d > len - TRIM - 4) return;
      const a: Point = [x, z], b: Point = [x + dx * 4, z + dz * 4];
      for (const side of [-1, 1]) {
        addSegment(yellow, a, b, 0.05, Y, side * (half - 0.35));
        addSegment(yellow, a, b, 0.05, Y, side * (half - 0.55));
      }
    });
  }

  // ---- Zebra crossings ------------------------------------------------------
  // Real ones from OSM if we have them, otherwise guess at a few junctions.
  const zebras = data.zebras?.length ? realZebras(data) : findZebraSpots(data, near);
  for (const zb of zebras) {
    // White bars 0.5 m wide, 3 m long (along the road), 0.5 m apart, across the road.
    const rx = -zb.dz, rz = zb.dx; // across the road
    for (let s = -zb.halfWidth + 0.6; s <= zb.halfWidth - 0.4; s += 1) {
      const cx = zb.x + rx * s, cz = zb.z + rz * s;
      addSegment(white, [cx - zb.dx * 1.5, cz - zb.dz * 1.5], [cx + zb.dx * 1.5, cz + zb.dz * 1.5], 0.25, Y);
    }
  }

  const group = new THREE.Group();
  group.add(
    flatMesh(white, new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.6 })),
    flatMesh(yellow, new THREE.MeshStandardMaterial({ color: 0xd9a514, roughness: 0.6 })),
  );
  return { group, zebras };
}

/** Real zebra crossings: OSM gives a point; we line it up with the nearest street. */
function realZebras(data: LondonData): Zebra[] {
  const out: Zebra[] = [];
  for (const [x, z] of data.zebras ?? []) {
    const s = nearestStreet(data, x, z);
    if (s.dist > s.halfWidth + 3) continue; // not actually on a street we draw
    out.push({ x: s.x, z: s.z, dx: s.dx, dz: s.dz, halfWidth: s.halfWidth });
  }
  return out;
}

/**
 * Find a few junctions (where 3+ streets meet) near the player, and put a
 * zebra crossing on one of the streets, 10 m back from the junction.
 */
function findZebraSpots(data: LondonData, near: { x: number; z: number }, max = 12): Zebra[] {
  const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
  // Count how many street ends touch each point.
  const ends = new Map<string, { road: Road; atStart: boolean }[]>();
  for (const road of data.roads) {
    if (!isStreet(road)) continue;
    for (const atStart of [true, false]) {
      const p = atStart ? road.points[0] : road.points[road.points.length - 1];
      const key = `${Math.round(p[0])},${Math.round(p[1])}`;
      if (!ends.has(key)) ends.set(key, []);
      ends.get(key)!.push({ road, atStart });
    }
  }

  const spots: Zebra[] = [];
  const candidates = [...ends.values()]
    .filter((list) => list.length >= 3 && list.some((e) => MAJOR.has(e.road.type)))
    .map((list) => {
      // Use a major road arm that's long enough.
      const arm = list.find((e) => MAJOR.has(e.road.type) && polylineLength(e.road.points) > 25);
      if (!arm) return null;
      const pts = arm.atStart ? arm.road.points : [...arm.road.points].reverse();
      let spot: Zebra | null = null;
      walkAlong(pts, 1000, 10, (x, z, dx, dz) => {
        spot = { x, z, dx, dz, halfWidth: arm.road.width / 2 };
      });
      return spot as Zebra | null;
    })
    .filter((s): s is Zebra => s !== null)
    .sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z));

  for (const c of candidates) {
    if (spots.length >= max) break;
    if (spots.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 80)) continue; // spread them out
    spots.push(c);
  }
  return spots;
}
