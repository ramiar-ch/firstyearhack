// fetch-osm.mjs
// -----------------------------------------------------------------------------
// Downloads buildings + roads around the KCL Strand Building from OpenStreetMap
// (via the Overpass API) ONE TIME, converts them to local metres and saves
// them to client/public/data/london.json. The game only ever reads that file.
//
// Run it from the client folder:   npm.cmd run fetch-osm
// Change the radius:               npm.cmd run fetch-osm -- 2000
//
// Map data © OpenStreetMap contributors, available under the ODbL.
// -----------------------------------------------------------------------------

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- Config -----------------------------------------------------------------
const ORIGIN = { lat: 51.5115, lon: -0.116 }; // KCL Strand Building = (0, 0)
const RADIUS = Number(process.argv[2]) || 1000; // metres
const DEFAULT_HEIGHT = 15; // metres, when OSM has no height info
const METRES_PER_LEVEL = 3.5;

// Several public Overpass servers - we try them in order if one is busy.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Road types we draw, and how wide (metres) each one is.
const ROAD_WIDTHS = {
  motorway: 14, trunk: 12, primary: 12, secondary: 10, tertiary: 9,
  unclassified: 7, residential: 7, living_street: 6, service: 4.5,
  pedestrian: 5, motorway_link: 7, trunk_link: 7, primary_link: 7,
  secondary_link: 6, tertiary_link: 6,
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'public', 'data', 'london.json');

// ---- lat/lon -> local metres ------------------------------------------------
// At city scale the Earth is basically flat, so a simple "equirectangular"
// projection is accurate enough. We output Three.js-style coordinates:
//   x = metres EAST of the origin,  z = metres SOUTH of the origin
// (in Three.js the camera looks down -z, so north is -z).
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

function toLocal(lat, lon) {
  const x = (lon - ORIGIN.lon) * M_PER_DEG_LON;
  const z = -(lat - ORIGIN.lat) * M_PER_DEG_LAT;
  return [round(x), round(z)];
}
const round = (n) => Math.round(n * 100) / 100; // 1 cm precision = smaller file

// ---- Height from OSM tags ---------------------------------------------------
function buildingHeight(tags = {}) {
  const h = parseFloat(tags.height ?? tags['building:height']);
  if (!Number.isNaN(h) && h > 0) return h;
  const levels = parseFloat(tags['building:levels']);
  if (!Number.isNaN(levels) && levels > 0) return levels * METRES_PER_LEVEL;
  return DEFAULT_HEIGHT;
}

// ---- Geometry helpers -------------------------------------------------------
// Is point p inside polygon poly? (classic ray-casting test)
function pointInPolygon([px, pz], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Closest point to p on segment a-b.
function closestOnSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return [ax + t * dx, az + t * dz];
}

// Join line pieces (arrays of {lat, lon}) end-to-end into closed rings.
// Pieces whose ends never meet up are thrown away.
function joinRings(pieces) {
  const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
  const left = pieces.map((p) => [...p]);
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < left.length; i++) {
        const p = left[i];
        if (same(p[0], end)) ring = ring.concat(p.slice(1));
        else if (same(p[p.length - 1], end)) ring = ring.concat(p.slice(0, -1).reverse());
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

// ---- Download ---------------------------------------------------------------
async function queryOverpass(query) {
  for (const url of OVERPASS_URLS) {
    try {
      console.log(`Asking ${url} ...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'hackathon-osm-demo/1.0',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`  failed (${err.message}), trying next server...`);
    }
  }
  throw new Error('All Overpass servers failed. Wait a minute and try again.');
}

async function main() {
  const around = `around:${RADIUS},${ORIGIN.lat},${ORIGIN.lon}`;
  const roadRegex = Object.keys(ROAD_WIDTHS).join('|');
  // "out geom" gives us the coordinates directly, no separate node lookup needed.
  const query = `
    [out:json][timeout:120];
    (
      way["building"](${around});
      relation["building"]["type"="multipolygon"](${around});
      way["highway"~"^(${roadRegex})$"](${around});
    );
    out geom;`;

  const data = await queryOverpass(query);
  console.log(`Got ${data.elements.length} OSM elements. Converting...`);

  const buildings = [];
  const roads = [];

  for (const el of data.elements) {
    const tags = el.tags ?? {};

    if (el.type === 'way' && tags.building && el.geometry) {
      addBuilding(el.geometry, tags);
    } else if (el.type === 'relation' && el.members) {
      // Multipolygon buildings: the outline is split over several ways, so we
      // stitch the "outer" pieces into closed rings (and ignore courtyards).
      const pieces = el.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
      for (const ring of joinRings(pieces)) addBuilding(ring, tags);
    } else if (el.type === 'way' && tags.highway && el.geometry) {
      roads.push({
        type: tags.highway,
        name: tags.name ?? '',
        width: ROAD_WIDTHS[tags.highway] ?? 6,
        points: el.geometry.map((g) => toLocal(g.lat, g.lon)),
      });
    }
  }

  function addBuilding(geometry, tags) {
    const pts = geometry.map((g) => toLocal(g.lat, g.lon));
    // OSM closes rings by repeating the first point - drop the duplicate.
    const [fx, fz] = pts[0], [lx, lz] = pts[pts.length - 1];
    if (fx === lx && fz === lz) pts.pop();
    if (pts.length < 3) return;
    buildings.push({ height: round(buildingHeight(tags)), name: tags.name ?? '', footprint: pts });
  }

  // ---- Mark the KCL building + choose a spawn point outside it -------------
  // The origin is inside the Strand Building, so spawn on the nearest bit of
  // the road called "Strand" (falls back to any road if that's missing).
  const kcl = buildings.find((b) => pointInPolygon([0, 0], b.footprint));
  if (kcl) kcl.kcl = true;

  const strandRoads = roads.filter((r) => r.name === 'Strand');
  const candidates = strandRoads.length ? strandRoads : roads;
  let spawn = [0, 0], best = Infinity;
  for (const r of candidates) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const p = closestOnSegment([0, 0], r.points[i], r.points[i + 1]);
      const d = Math.hypot(p[0], p[1]);
      if (d < best) { best = d; spawn = p.map(round); }
    }
  }

  const out = {
    attribution: '© OpenStreetMap contributors',
    origin: ORIGIN,
    radius: RADIUS,
    spawn: { x: spawn[0], z: spawn[1] },
    buildings,
    roads,
  };

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out));
  console.log(
    `Saved ${buildings.length} buildings and ${roads.length} roads to ${OUT_FILE}\n` +
      `KCL building found: ${kcl ? `yes (${kcl.name || 'unnamed'})` : 'no'}; spawn at (${spawn.join(', ')})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
