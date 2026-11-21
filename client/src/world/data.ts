// data.ts - the shape of public/data/london.json (made by scripts/fetch-osm.mjs)
// and a function to load it.
//
// All coordinates are in METRES around the KCL Strand Building:
//   x = metres east, z = metres south  (Three.js: north is -z)

export type Point = [number, number]; // [x, z]

export interface Building {
  height: number; // top of the building, metres above the ground
  footprint: Point[];
  base?: number; // bottom, if it floats (e.g. a tower part on top of a podium)
  collisionOnly?: boolean; // outline of a building drawn as separate parts: don't draw, still solid
  name?: string;
  colour?: string; // OSM building:colour, e.g. "#d8ccb0" or "brown"
  roofColour?: string; // OSM roof:colour
  material?: string; // OSM building:material, e.g. "brick", "glass", "stone"
  kcl?: boolean; // true for the KCL Strand Building
}

export interface Road {
  type: string; // OSM highway=..., e.g. "primary", "footway"
  name: string;
  width: number; // metres
  points: Point[];
  bridge?: boolean;
  oneway?: boolean;
}

export interface Landmark {
  label: string;
  x: number;
  z: number;
  height: number; // label floats above this
}

export interface LondonData {
  attribution: string;
  radius: number;
  spawn: { x: number; z: number };
  landmarks: Landmark[];
  buildings: Building[];
  roads: Road[];
  water: Point[][]; // polygons
  parks: Point[][]; // polygons
  plazas?: Point[][]; // paved squares and piers (polygons)
  trees: Point[];
  // Real positions from OSM (only when made with convert-map):
  zebras?: Point[];
  busStops?: Point[];
  phoneBoxes?: Point[];
}

// Roads for people only (no cars, no pavements, no road markings).
const WALK_TYPES = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway']);
export const isCarRoad = (r: Road) => !WALK_TYPES.has(r.type);
// "Proper" streets get pavements, lamps and markings (not back-alley service roads).
export const isStreet = (r: Road) => isCarRoad(r) && r.type !== 'service';

/** The street closest to (x, z): the closest point on it and its direction there. */
export function nearestStreet(data: LondonData, x: number, z: number) {
  let best = { dist: Infinity, x: 0, z: 0, dx: 1, dz: 0, halfWidth: 3 };
  for (const road of data.roads) {
    if (!isStreet(road)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i], [bx, bz] = road.points[i + 1];
      const ex = bx - ax, ez = bz - az;
      const len2 = ex * ex + ez * ez;
      if (len2 < 1e-4) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2));
      const px = ax + t * ex, pz = az + t * ez;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < best.dist) {
        const len = Math.sqrt(len2);
        best = { dist, x: px, z: pz, dx: ex / len, dz: ez / len, halfWidth: road.width / 2 };
      }
    }
  }
  return best;
}

export async function loadLondonData(): Promise<LondonData> {
  const res = await fetch('./data/london.json');
  if (!res.ok) throw new Error('Could not load london.json - did you run "npm.cmd run fetch-osm"?');
  return res.json();
}
