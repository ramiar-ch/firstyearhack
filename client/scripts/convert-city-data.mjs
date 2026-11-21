// convert-city-data.mjs
// -----------------------------------------------------------------------------
// Turns the teammates' city viewer data (city-viewer/city-data.js, already
// downloaded from OpenStreetMap, 2 km around KCL) into our london.json.
// Much faster than fetch-osm.mjs and doesn't depend on busy Overpass servers.
//
// Run from the client folder:
//   npm.cmd run convert-map                      (1000 m radius)
//   npm.cmd run convert-map -- 2000              (bigger radius, max 2000)
//   npm.cmd run convert-map -- 1000 path/to/city-data.js
//
// city-data.js format (made by city-viewer/tools/process-osm.js):
//   coordinates are whole DECIMETRES, flat lists [x0, z0, x1, z1, ...],
//   x = east, z = south of KCL - the same directions we use.
//
// Map data © OpenStreetMap contributors, available under the ODbL.
// -----------------------------------------------------------------------------

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RADIUS, DEFAULT_HEIGHT, METRES_PER_LEVEL, ROAD_WIDTHS, roadWidth,
  round, clipToSquare, nearOrigin, finishAndSave,
} from './map-common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RADIUS = Math.min(Number(process.argv[2]) || DEFAULT_RADIUS, 2000);
const INPUT = process.argv[3] ?? join(__dirname, '..', '..', 'city-viewer', 'city-data.js');
const KEEP = RADIUS + 60; // keep things this close to KCL (a little past the radius)

// Load city-data.js: it's "window.CITY = {...};" - strip that and parse the JSON.
const text = await readFile(INPUT, 'utf8');
const CITY = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
const name = (i) => (i === undefined || i < 0 ? '' : CITY.names[i]);

/** Flat decimetre list [x0, z0, x1, z1...] -> [[x, z], ...] in metres. */
const toPoints = (flat) => {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i] / 10, flat[i + 1] / 10]);
  return pts;
};

// ---- Buildings ------------------------------------------------------------------
// Some buildings are split into "parts" (e.g. a tower on top of a podium). The
// viewer draws the parts and hides the outline (flag hp) - we do the same,
// but keep hidden outlines for COLLISIONS so you can't drive into them.
const buildings = [];
for (const b of CITY.b) {
  if (b.sky) continue; // far-away skyline towers
  const footprint = toPoints(b.p);
  if (!nearOrigin(footprint, KEEP)) continue;

  let height = b.H ?? (b.L !== undefined ? (b.L + (b.RL ?? 0)) * METRES_PER_LEVEL : DEFAULT_HEIGHT);
  const base = b.m ?? (b.ML !== undefined ? b.ML * METRES_PER_LEVEL : 0);
  if (height <= base) height = base + 3;

  const out = { height: round(height), footprint };
  if (base > 0) out.base = round(base);
  if (b.hp) out.collisionOnly = true;
  if (b.n !== undefined) out.name = name(b.n);
  if (b.c) out.colour = b.c;
  if (b.rc) out.roofColour = b.rc;
  if (b.mat) out.material = b.mat;
  buildings.push(out);
}

// ---- Roads ----------------------------------------------------------------------
const roads = [];
for (const r of CITY.roads) {
  if ((r.ly ?? 0) < 0) continue; // underground
  const type = CITY.hw[r.t];
  if (!(type in ROAD_WIDTHS)) continue; // tracks, corridors etc.
  const points = toPoints(r.p);
  if (!nearOrigin(points, KEEP)) continue;
  const roadName = name(r.n);
  // Width: famous roads > OSM width tag > lanes x 3.5 m > typical for the type.
  let width = roadWidth(type, roadName, r.w && r.w < 30 ? r.w : r.l ? r.l * 3.5 : undefined);
  if (r.sw) width = Math.min(width, 2.5); // mapped pavements stay narrow
  const road = { type, name: roadName, width: round(width), points };
  if (r.b) road.bridge = true;
  if (r.o) road.oneway = true;
  roads.push(road);
}

// ---- Water, parks, plazas -------------------------------------------------------
const CLIP = RADIUS + 300;
const clipped = (flat) => {
  const poly = clipToSquare(toPoints(flat), CLIP);
  return poly.length >= 3 ? poly : null;
};
const water = CITY.water.map(clipped).filter(Boolean);
const parks = [];
const plazas = [];
for (const g of CITY.green) {
  const poly = clipped(g.p);
  if (!poly || !nearOrigin(poly, KEEP + 300)) continue;
  if (g.k === 'plaza' || g.k === 'pier' || g.k === 'pierl') plazas.push(poly);
  else parks.push(poly);
}

// ---- Points: trees, zebra crossings, bus stops, phone boxes, stations ----------
/** Read a flat point list with `stride` numbers per point. */
const points = (key, stride, keep = () => true) => {
  const list = CITY.pts[key] ?? [];
  const out = [];
  for (let i = 0; i < list.length; i += stride) {
    const p = [list[i] / 10, list[i + 1] / 10];
    if (Math.hypot(p[0], p[1]) <= RADIUS && keep(list, i)) out.push(p);
  }
  return out;
};
const trees = points('tree', 2);
const zebras = points('cross', 3, (l, i) => l[i + 2] === 1); // 1 = zebra
const busStops = points('bus', 3);
const phoneBoxes = points('phone', 2);
const tube = CITY.pts.tube ?? [];
const stations = [];
for (let i = 0; i < tube.length; i += 3) {
  stations.push({ name: name(tube[i + 2]), pos: [tube[i] / 10, tube[i + 1] / 10] });
}

console.log(`Converting ${INPUT} (radius ${RADIUS} m)...`);
await finishAndSave(
  { buildings, roads, water, parks, plazas, trees, zebras, busStops, phoneBoxes, stations },
  RADIUS,
);
