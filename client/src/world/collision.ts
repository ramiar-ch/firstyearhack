// collision.ts - stops people and cars going through buildings.
//
// Everything that moves is treated as a CIRCLE (seen from above), and every
// building is its real OSM outline (a polygon). If a circle overlaps a
// polygon we push the circle back out. Simple, and works for angled buildings.
//
// To stay fast with ~2800 buildings we use a "grid": the map is cut into
// 40 m squares and each square remembers which buildings touch it, so we
// only test the handful of buildings near the circle.
//
// WATER: you can't walk or drive into the Thames - except on bridges.

import type { Building, Point, Road } from './data';

const CELL = 40; // metres
const BRIDGE_EXTRA = 3; // bridges are a bit wider than the road (pavements)

interface WaterArea {
  poly: Point[];
  minX: number; maxX: number; minZ: number; maxZ: number; // bounding box (quick test)
}
interface BridgeSegment {
  a: Point;
  b: Point;
  half: number; // half width incl. pavements
}

export class CollisionWorld {
  private grid = new Map<string, Point[][]>();
  private water: WaterArea[] = [];
  private bridges: BridgeSegment[] = [];

  constructor(buildings: Building[], water: Point[][] = [], roads: Road[] = []) {
    for (const poly of water) {
      const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
      this.water.push({
        poly,
        minX: Math.min(...xs), maxX: Math.max(...xs),
        minZ: Math.min(...zs), maxZ: Math.max(...zs),
      });
    }
    for (const r of roads) {
      if (!r.bridge) continue;
      for (let i = 0; i < r.points.length - 1; i++) {
        this.bridges.push({ a: r.points[i], b: r.points[i + 1], half: r.width / 2 + BRIDGE_EXTRA });
      }
    }

    for (const b of buildings) {
      // Parts floating 3+ m up (overhangs, towers on podiums) don't block the street.
      if ((b.base ?? 0) > 3) continue;
      // Put the building into every grid cell its bounding box covers.
      const xs = b.footprint.map((p) => p[0]);
      const zs = b.footprint.map((p) => p[1]);
      for (let cx = cell(Math.min(...xs)); cx <= cell(Math.max(...xs)); cx++) {
        for (let cz = cell(Math.min(...zs)); cz <= cell(Math.max(...zs)); cz++) {
          const key = `${cx},${cz}`;
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key)!.push(b.footprint);
        }
      }
    }
  }

  // All building outlines near a circle (no duplicates).
  private nearby(x: number, z: number, r: number): Set<Point[]> {
    const found = new Set<Point[]>();
    for (let cx = cell(x - r); cx <= cell(x + r); cx++) {
      for (let cz = cell(z - r); cz <= cell(z + r); cz++) {
        for (const poly of this.grid.get(`${cx},${cz}`) ?? []) found.add(poly);
      }
    }
    return found;
  }

  /**
   * Pushes a circle (centre pos.x/pos.z, radius r) out of any building.
   * CHANGES pos. Returns true if it hit something.
   */
  resolveCircle(pos: { x: number; z: number }, r: number): boolean {
    let hit = false;
    // Two passes so corners (touching two walls) are handled.
    for (let pass = 0; pass < 2; pass++) {
      for (const poly of this.nearby(pos.x, pos.z, r)) {
        const [cx, cz] = closestPointOnOutline(pos.x, pos.z, poly);
        let dx = pos.x - cx, dz = pos.z - cz;
        const dist = Math.hypot(dx, dz);
        const inside = pointInPolygon(pos.x, pos.z, poly);
        if (!inside && dist >= r) continue; // not touching
        if (dist < 1e-6) continue; // exactly on the wall - can't tell direction

        // Direction to push: away from the wall (or towards it, then past, if inside).
        dx /= dist; dz /= dist;
        if (inside) { dx = -dx; dz = -dz; }
        pos.x = cx + dx * r;
        pos.z = cz + dz * r;
        hit = true;
      }
    }
    return hit;
  }

  /** Is there a building overlapping this circle? (doesn't move anything) */
  isBlocked(x: number, z: number, r: number): boolean {
    const p = { x, z };
    return this.resolveCircle(p, r);
  }

  /** Is this point in the river (and NOT on a bridge)? */
  isWater(x: number, z: number): boolean {
    let wet = false;
    for (const w of this.water) {
      if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
      if (pointInPolygon(x, z, w.poly)) { wet = true; break; }
    }
    if (!wet) return false;
    // On a bridge? Then it's dry.
    for (const br of this.bridges) {
      const [cx, cz] = closestOnSegment(x, z, br.a, br.b);
      if (Math.hypot(x - cx, z - cz) < br.half) return false;
    }
    return true;
  }
}

function closestOnSegment(px: number, pz: number, [ax, az]: Point, [bx, bz]: Point): Point {
  const ex = bx - ax, ez = bz - az;
  const len2 = ex * ex + ez * ez || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len2));
  return [ax + t * ex, az + t * ez];
}

// ---- Small geometry helpers ---------------------------------------------------
function cell(v: number) {
  return Math.floor(v / CELL);
}

function pointInPolygon(px: number, pz: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestPointOnOutline(px: number, pz: number, poly: Point[]): Point {
  let best: Point = poly[0];
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [bx, bz] = poly[i];
    const ex = bx - ax, ez = bz - az;
    const len2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len2));
    const qx = ax + t * ex, qz = az + t * ez;
    const d = (px - qx) ** 2 + (pz - qz) ** 2;
    if (d < bestD) { bestD = d; best = [qx, qz]; }
  }
  return best;
}
