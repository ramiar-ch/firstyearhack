// map-common.mjs - shared code for the two ways of making london.json:
//   fetch-osm.mjs         downloads from the Overpass API ourselves
//   convert-city-data.mjs converts the teammates' city-viewer/city-data.js
// Both produce the SAME london.json format (see client/src/world/data.ts).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN = { lat: 51.5115, lon: -0.116 }; // KCL Strand Building = (0, 0)
export const DEFAULT_RADIUS = 1000; // metres (pass a number on the command line to change)
export const DEFAULT_HEIGHT = 18; // metres, when OSM has no height info
export const METRES_PER_LEVEL = 3.5;

// Road types we draw, and how wide (metres) each one is.
export const ROAD_WIDTHS = {
  motorway: 16, trunk: 14, primary: 13, secondary: 11, tertiary: 9,
  unclassified: 7, residential: 7, living_street: 6, service: 4.5,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6,
  // walking only:
  pedestrian: 8, footway: 2.5, path: 2, steps: 2.5, cycleway: 2.5,
};
// The famous wide roads get extra width (car roads only - not the cycle
// lanes and footpaths that share their name). Use roadWidth() below.
const WIDE_ROADS = { Strand: 16, Aldwych: 16, Kingsway: 18, 'Waterloo Bridge': 16 };
export const WALK_TYPES = new Set(['pedestrian', 'footway', 'path', 'steps', 'cycleway']);

/** Width of a road: famous main road > given width > typical for its type. */
export function roadWidth(type, name, given) {
  if (!WALK_TYPES.has(type) && type !== 'service' && WIDE_ROADS[name]) return WIDE_ROADS[name];
  return given ?? ROAD_WIDTHS[type] ?? 6;
}

// Floating labels in the game. For each one we look for a BUILDING with a
// matching name, then a STATION, then a ROAD (OSM names things differently:
// e.g. Bush House itself has no name tag, but "Bush House Arcade" does).
const LANDMARKS = [
  { label: "King's College (Strand Building)", name: null }, // = the KCL building
  { label: 'Bush House', name: /^Bush House/ },
  { label: 'Somerset House', name: /^Somerset House$/ },
  { label: 'Temple station', name: /^Temple Station$/i },
  { label: 'Montreal Place', name: /^Montreal Place$/ },
  { label: 'Waterloo Bridge', name: /^Waterloo Bridge$/ },
  { label: 'Aldwych', name: /^Aldwych$/ },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
export const OUT_FILE = join(__dirname, '..', 'public', 'data', 'london.json');

export const round = (n) => Math.round(n * 100) / 100; // 1 cm precision = smaller file

// ---- Geometry helpers -------------------------------------------------------
export function pointInPolygon([px, pz], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function closestOnSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return [ax + t * dx, az + t * dz];
}

function centroid(poly) {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

/** Cut a polygon to the square [-clip, clip] (Sutherland-Hodgman, one edge at a time). */
export function clipToSquare(poly, clip) {
  const lerpAt = (a, b, axis, value) => {
    const t = (value - a[axis]) / (b[axis] - a[axis]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const edges = [[0, -clip, 1], [0, clip, -1], [1, -clip, 1], [1, clip, -1]]; // [axis, value, keep-side]
  let out = poly;
  for (const [axis, value, sign] of edges) {
    const inside = (p) => (p[axis] - value) * sign >= 0;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i], prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(lerpAt(prev, cur, axis, value));
        out.push(cur);
      } else if (inside(prev)) out.push(lerpAt(prev, cur, axis, value));
    }
    if (out.length === 0) return [];
  }
  return out.map((p) => p.map(round));
}

/** Is any point of the shape within `r` metres of the origin? */
export const nearOrigin = (pts, r) => pts.some(([x, z]) => Math.hypot(x, z) <= r);

// ---- Spawn point ------------------------------------------------------------------
// The game camera looks down at 75 degrees from the SOUTH. A tall building
// just south of the players would hide them, so we pick the point on the
// Strand nearest to KCL where the camera can actually see both players
// (they stand 2 m either side of the spawn point).
const CAMERA_SLOPE = Math.tan((75 * Math.PI) / 180); // the view line rises this much per metre south

function canSee([x, z], nearBuildings) {
  for (let s = 0; s <= 40; s += 0.5) {
    const rayHeight = 2 + CAMERA_SLOPE * s; // height of the view line, s metres south
    for (const b of nearBuildings) {
      if (b.height > rayHeight && (b.base ?? 0) < rayHeight && pointInPolygon([x, z + s], b.footprint)) return false;
    }
  }
  return true;
}

function chooseSpawn(buildings, roads) {
  const strand = roads.filter((r) => r.name === 'Strand');
  const lines = strand.length ? strand : roads;
  // Possible spots: every 2 m along the Strand, nearest to KCL first.
  const spots = [];
  for (const r of lines) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i], [bx, bz] = r.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 2) spots.push([ax + ((bx - ax) * t) / (len || 1), az + ((bz - az) * t) / (len || 1)]);
    }
  }
  spots.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));

  for (const [x, z] of spots.slice(0, 600)) {
    const near = buildings.filter((b) => b.footprint.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 120));
    const solid = near.filter((b) => !b.collisionOnly);
    const players = [[x - 2, z], [x + 2, z]];
    const free = players.every((p) => !near.some((b) => pointInPolygon(p, b.footprint)));
    if (free && players.every((p) => canSee(p, solid))) return [round(x), round(z)];
  }
  console.warn('  no clearly visible spawn found - using the nearest point on the Strand');
  return spots[0] ? spots[0].map(round) : [0, 0];
}

// ---- Finish + save --------------------------------------------------------------
/**
 * Takes the converted map pieces, marks the KCL building, picks the spawn
 * point and landmark positions, then writes london.json.
 *   map.stations: [{ name, pos: [x, z] }] - used only to find landmarks
 */
export async function finishAndSave(map, radius) {
  const { buildings, roads, stations = [] } = map;

  // The origin is inside the KCL Strand Building.
  const kcl = buildings.find((b) => !b.collisionOnly && pointInPolygon([0, 0], b.footprint));
  if (kcl) kcl.kcl = true;

  const spawn = chooseSpawn(buildings, roads);

  // Landmarks for the floating labels.
  const landmarks = [];
  for (const lm of LANDMARKS) {
    let pos = null, height = 10;
    if (lm.name === null) {
      if (kcl) { pos = centroid(kcl.footprint); height = kcl.height; }
    } else {
      // 1. The biggest building with that name.
      const matches = buildings.filter((b) => b.name && lm.name.test(b.name));
      matches.sort((a, b) => b.footprint.length - a.footprint.length);
      if (matches[0]) { pos = centroid(matches[0].footprint); height = matches[0].height; }
      // 2. The middle point of all the matching car-road pieces (bridge parts
      //    first, so "Waterloo Bridge" sits over the river).
      //    If no car road matches, try footpaths too (e.g. "Bush House Arcade").
      const matching = roads.filter((r) => lm.name.test(r.name));
      const carRoads = matching.filter((r) => !WALK_TYPES.has(r.type));
      const named = carRoads.length ? carRoads : matching;
      const bridgeParts = named.filter((r) => r.bridge);
      if (!pos && bridgeParts.length) {
        pos = centroid(bridgeParts.flatMap((r) => r.points)); // middle of the bridge
      } else if (!pos && named.length) {
        const pts = named.flatMap((r) => r.points);
        pos = pts[Math.floor(pts.length / 2)];
      }
      // 3. A station with that name.
      const station = stations.find((s) => lm.name.test(s.name));
      if (!pos && station) pos = station.pos;
    }
    if (pos) landmarks.push({ label: lm.label, x: round(pos[0]), z: round(pos[1]), height: round(height) });
    else console.warn(`  landmark not found: ${lm.label}`);
  }

  const out = {
    attribution: '© OpenStreetMap contributors',
    origin: ORIGIN,
    radius,
    spawn: { x: spawn[0], z: spawn[1] },
    landmarks,
    buildings,
    roads,
    water: map.water ?? [],
    parks: map.parks ?? [],
    plazas: map.plazas ?? [],
    trees: map.trees ?? [],
    // Optional real positions (only the city-data converter has these):
    zebras: map.zebras ?? [],
    busStops: map.busStops ?? [],
    phoneBoxes: map.phoneBoxes ?? [],
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(
    `Saved ${buildings.length} buildings, ${roads.length} roads, ${out.water.length} water, ` +
      `${out.parks.length} parks, ${out.plazas.length} plazas, ${out.trees.length} trees, ` +
      `${out.zebras.length} zebras, ${out.busStops.length} bus stops, ${out.phoneBoxes.length} phone boxes, ` +
      `${landmarks.length}/${LANDMARKS.length} landmarks\n  -> ${OUT_FILE}\n` +
      `KCL building found: ${kcl ? 'yes' : 'no'}; spawn at (${spawn.join(', ')})`,
  );
}
