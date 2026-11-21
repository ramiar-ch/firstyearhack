// fetch-osm.mjs
// -----------------------------------------------------------------------------
// Downloads the map around the KCL Strand Building from OpenStreetMap (via the
// Overpass API) and saves client/public/data/london.json.
//
// NOTE: the public Overpass servers are often overloaded. The quicker way is
//   npm.cmd run convert-map
// which converts the city viewer's already-downloaded data instead.
//
// Run from the client folder:   npm.cmd run fetch-osm          (1000 m)
//                               npm.cmd run fetch-osm -- 2000  (bigger radius)
//
// Map data © OpenStreetMap contributors, available under the ODbL.
// -----------------------------------------------------------------------------

import {
  ORIGIN, DEFAULT_RADIUS, DEFAULT_HEIGHT, METRES_PER_LEVEL, ROAD_WIDTHS, roadWidth,
  round, clipToSquare, finishAndSave,
} from './map-common.mjs';

const RADIUS = Number(process.argv[2]) || DEFAULT_RADIUS;
const CLIP = RADIUS + 300; // big shapes (the Thames) are cut to this square

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// ---- lat/lon -> local metres ------------------------------------------------
// At city scale the Earth is basically flat, so a simple "equirectangular"
// projection is accurate enough:  x = metres EAST,  z = metres SOUTH of KCL.
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
function toLocal(lat, lon) {
  return [round((lon - ORIGIN.lon) * M_PER_DEG_LON), round(-(lat - ORIGIN.lat) * M_PER_DEG_LAT)];
}

function buildingHeight(tags = {}) {
  const h = parseFloat(tags.height ?? tags['building:height']);
  if (!Number.isNaN(h) && h > 0) return h;
  const levels = parseFloat(tags['building:levels']);
  const roofLevels = parseFloat(tags['roof:levels']) || 0;
  if (!Number.isNaN(levels) && levels > 0) return (levels + roofLevels) * METRES_PER_LEVEL;
  return DEFAULT_HEIGHT;
}

// Join line pieces (arrays of {lat, lon}) end-to-end into closed rings.
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

// Remove the repeated closing point, return null if too small.
function cleanRing(pts) {
  if (pts.length === 0) return null;
  const [fx, fz] = pts[0], [lx, lz] = pts[pts.length - 1];
  if (fx === lx && fz === lz) pts.pop();
  return pts.length >= 3 ? pts : null;
}

// Rings for a way or a multipolygon relation (outer rings only).
function ringsOf(el) {
  if (el.type === 'way' && el.geometry) return [el.geometry];
  if (el.type === 'relation' && el.members) {
    return joinRings(el.members.filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry));
  }
  return [];
}

// ---- Download ---------------------------------------------------------------
// Public Overpass servers are often busy (HTTP 502/504), so we try every
// server, wait, and go round again a few times before giving up.
async function queryOverpass(query, rounds = 4) {
  for (let r = 1; r <= rounds; r++) {
    for (const url of OVERPASS_URLS) {
      try {
        console.log(`  asking ${url} ...`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'hackathon-osm-demo/1.0' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(150_000), // give up on a server after 2.5 minutes
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        console.warn(`    failed (${err.message})`);
      }
    }
    if (r < rounds) {
      console.log(`  all servers busy - waiting 30 s (round ${r}/${rounds})...`);
      await new Promise((res) => setTimeout(res, 30_000));
    }
  }
  throw new Error('All Overpass servers failed. Try "npm.cmd run convert-map" instead.');
}

async function main() {
  const around = `around:${RADIUS},${ORIGIN.lat},${ORIGIN.lon}`;
  const roadRegex = Object.keys(ROAD_WIDTHS).join('|');
  // Several smaller queries - one giant query makes busy servers give up.
  const parts = {
    buildings: `way["building"](${around}); relation["building"]["type"="multipolygon"](${around});`,
    roads: `way["highway"~"^(${roadRegex})$"](${around});`,
    water: `way["natural"="water"](${around}); relation["natural"="water"](${around});`,
    'parks, trees, stations': `
      way["leisure"~"^(park|garden)$"](${around});
      relation["leisure"~"^(park|garden)$"](${around});
      way["landuse"~"^(grass|recreation_ground|village_green)$"](${around});
      node["natural"="tree"](${around});
      node["railway"="station"](${around});`,
  };
  const elements = [];
  for (const [name, body] of Object.entries(parts)) {
    console.log(`Downloading ${name}...`);
    const result = await queryOverpass(`[out:json][timeout:120];(${body});out geom;`);
    console.log(`  got ${result.elements.length} elements`);
    elements.push(...result.elements);
  }

  const map = { buildings: [], roads: [], water: [], parks: [], trees: [], stations: [] };
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (tags.building) {
      for (const ring of ringsOf(el)) {
        const footprint = cleanRing(ring.map((g) => toLocal(g.lat, g.lon)));
        if (!footprint) continue;
        const b = { height: round(buildingHeight(tags)), footprint };
        if (tags.name) b.name = tags.name;
        if (tags['building:colour']) b.colour = tags['building:colour'];
        if (tags['roof:colour']) b.roofColour = tags['roof:colour'];
        if (tags['building:material']) b.material = tags['building:material'];
        map.buildings.push(b);
      }
    } else if (el.type === 'way' && tags.highway && el.geometry) {
      if (tags.tunnel === 'yes' || Number(tags.layer) < 0 || tags.area === 'yes') continue;
      const road = {
        type: tags.highway,
        name: tags.name ?? '',
        width: roadWidth(tags.highway, tags.name ?? ''),
        points: el.geometry.map((g) => toLocal(g.lat, g.lon)),
      };
      if (tags.bridge && tags.bridge !== 'no') road.bridge = true;
      if (tags.oneway === 'yes') road.oneway = true;
      map.roads.push(road);
    } else if (tags.natural === 'water' || tags.leisure || tags.landuse) {
      const list = tags.natural === 'water' ? map.water : map.parks;
      for (const ring of ringsOf(el)) {
        const poly = cleanRing(clipToSquare(ring.map((g) => toLocal(g.lat, g.lon)), CLIP));
        if (poly) list.push(poly);
      }
    } else if (el.type === 'node' && tags.natural === 'tree') {
      map.trees.push(toLocal(el.lat, el.lon));
    } else if (el.type === 'node' && tags.railway === 'station') {
      map.stations.push({ name: tags.name ?? '', pos: toLocal(el.lat, el.lon) });
    }
  }
  await finishAndSave(map, RADIUS);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
