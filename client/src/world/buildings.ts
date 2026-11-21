// buildings.ts - turns OSM building outlines into 3D buildings.
//
// We build the geometry by hand (instead of ExtrudeGeometry) so we can:
//   - give the WALLS window texture coordinates measured in floors/windows
//   - colour each building with its own London material (vertex colours)
//   - give ROOFS a separate, slightly different colour
// All walls end up in ONE mesh and all roofs in another = 2 draw calls.

import * as THREE from 'three';
import type { Building, Point } from './data';
import { seededRandom } from './geometry';
import { createWindowTextures, WINDOW_GRID, WINDOW_WIDTH, FLOOR_HEIGHT } from './textures';

// London building materials (wall colours).
const MATERIALS = {
  portlandStone: new THREE.Color(0xd9ccad), // cream stone (Somerset House, Bush House, KCL)
  stockBrick: new THREE.Color(0xa8936a), // yellow-grey London stock brick
  redBrick: new THREE.Color(0x8e4634),
  darkGlass: new THREE.Color(0x34465e), // modern offices
};

// Colour names people use in OSM that aren't standard web colour names.
const EXTRA_COLOURS: Record<string, number> = {
  lightbrown: 0xb5895a, darkbrown: 0x5c3d24, yellowbrown: 0xb08a4a, cream: 0xe8dcc0,
  sandstone: 0xd2b48c, stone: 0xcfc3a6, brick: 0x8e4634, redbrick: 0x8e4634,
};

/**
 * Turn an OSM colour ("#aabbcc", "brown", "light_brown", "grey;red") into a
 * Color, or null if we don't understand it.
 */
function parseOsmColour(value: string): THREE.Color | null {
  const v = value.split(';')[0].trim().toLowerCase(); // first colour if several
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return new THREE.Color(v);
  const key = v.replace(/[\s_-]/g, ''); // "light_brown" -> "lightbrown"
  if (key in EXTRA_COLOURS) return new THREE.Color(EXTRA_COLOURS[key]);
  const named = (THREE.Color.NAMES as Record<string, number>)[key];
  return named !== undefined ? new THREE.Color(named) : null;
}

/** Pick a wall colour: OSM colour tag > OSM material tag > random London mix. */
function wallColour(b: Building, rand: () => number): THREE.Color {
  if (b.kcl) return MATERIALS.portlandStone.clone();
  const tagged = b.colour ? parseOsmColour(b.colour) : null;
  if (tagged) return tagged;
  const m = (b.material ?? '').toLowerCase();
  if (m.includes('glass')) return MATERIALS.darkGlass.clone();
  if (m.includes('stone') || m.includes('concrete')) return MATERIALS.portlandStone.clone();
  if (m.includes('brick')) return (rand() < 0.5 ? MATERIALS.redBrick : MATERIALS.stockBrick).clone();

  // No info: tall buildings are usually glass, otherwise a London mix.
  const r = rand();
  if (b.height > 45) return (r < 0.7 ? MATERIALS.darkGlass : MATERIALS.portlandStone).clone();
  if (r < 0.35) return MATERIALS.portlandStone.clone();
  if (r < 0.65) return MATERIALS.stockBrick.clone();
  if (r < 0.85) return MATERIALS.redBrick.clone();
  return MATERIALS.darkGlass.clone();
}

function roofColour(b: Building, wall: THREE.Color): THREE.Color {
  const tagged = b.roofColour ? parseOsmColour(b.roofColour) : null;
  if (tagged) return tagged.multiplyScalar(0.7);
  // Flat roofs: darker and a bit bluer/greyer than the walls (lead, felt, gravel).
  return wall.clone().multiplyScalar(0.45).lerp(new THREE.Color(0x30343e), 0.5);
}

/** Make the outline go anticlockwise (seen on our map) so walls face outwards. */
function orient(footprint: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    area += x1 * z2 - x2 * z1;
  }
  return area > 0 ? [...footprint].reverse() : footprint;
}

export function createBuildings(buildings: Building[], anisotropy: number): THREE.Group {
  const rand = seededRandom(42);
  const wall = { pos: [] as number[], norm: [] as number[], uv: [] as number[], col: [] as number[] };
  const roof = { pos: [] as number[], col: [] as number[] };

  for (const b of buildings) {
    if (b.collisionOnly) continue; // drawn as separate parts instead
    const fp = orient(b.footprint);
    const h = b.height;
    const base = b.base ?? 0; // most buildings start on the ground
    const wc = wallColour(b, rand);
    const rc = roofColour(b, wc);
    // Small random brightness change so neighbouring buildings differ.
    wc.multiplyScalar(0.85 + rand() * 0.3);

    // Each building starts at a random place in the window grid, so the lit
    // windows don't line up across the whole city.
    let u = Math.floor(rand() * WINDOW_GRID);
    const v0 = Math.floor(rand() * WINDOW_GRID);

    // ---- Walls: one rectangle (2 triangles) per outline edge ----
    for (let i = 0; i < fp.length; i++) {
      const [ax, az] = fp[i];
      const [bx, bz] = fp[(i + 1) % fp.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      // Outward-facing normal (the outline is anticlockwise, see orient()).
      const nx = -(bz - az) / len, nz = (bx - ax) / len;

      // Texture coords in "window grid" units: 1.0 = the whole 16x16 grid.
      const u1 = u / WINDOW_GRID;
      const u2 = (u + len / WINDOW_WIDTH) / WINDOW_GRID;
      const vb = (v0 + base / FLOOR_HEIGHT) / WINDOW_GRID;
      const vt = (v0 + h / FLOOR_HEIGHT) / WINDOW_GRID;
      u += len / WINDOW_WIDTH;

      // Corners: a0 b0 at the bottom, a1 b1 at the top.
      const a0 = [ax, base, az], b0 = [bx, base, bz], b1 = [bx, h, bz], a1 = [ax, h, az];
      wall.pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      wall.uv.push(u1, vb, u2, vb, u2, vt, u1, vb, u2, vt, u1, vt);
      for (let k = 0; k < 6; k++) {
        wall.norm.push(nx, 0, nz);
        wall.col.push(wc.r, wc.g, wc.b);
      }
    }

    // ---- Roof: fill the outline at the top ----
    const contour = fp.map(([x, z]) => new THREE.Vector2(x, z));
    let tris: number[][] = [];
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, []);
    } catch {
      /* broken outline - no roof */
    }
    for (const [i, j, k] of tris) {
      const a = fp[i], p = fp[j], q = fp[k];
      // Face up: swap two corners if needed.
      const up = (p[1] - a[1]) * (q[0] - a[0]) - (p[0] - a[0]) * (q[1] - a[1]) > 0;
      const [m, n] = up ? [p, q] : [q, p];
      roof.pos.push(a[0], h, a[1], m[0], h, m[1], n[0], h, n[1]);
      for (let c = 0; c < 3; c++) roof.col.push(rc.r, rc.g, rc.b);
    }
  }

  // ---- Meshes ----
  const { map, emissiveMap } = createWindowTextures(anisotropy);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wall.pos, 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wall.norm, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wall.uv, 2));
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wall.col, 3));
  const wallMat = new THREE.MeshStandardMaterial({
    vertexColors: true, // per-building colour
    map, // wall + dark windows
    emissive: 0xffffff,
    emissiveMap, // lit windows glow
    roughness: 0.85,
  });

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roof.pos, 3));
  roofGeo.computeVertexNormals();
  roofGeo.setAttribute('color', new THREE.Float32BufferAttribute(roof.col, 3));
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(wallGeo, wallMat), new THREE.Mesh(roofGeo, roofMat));

  // ---- KCL Strand Building: a warm glowing outline so you can find it ----
  const kcl = buildings.find((b) => b.kcl);
  if (kcl) group.add(createOutline(kcl));
  return group;
}

/** Orange lines around the roof edge, base and corners of one building. */
function createOutline(b: Building): THREE.LineSegments {
  const pts: number[] = [];
  const fp = b.footprint, h = b.height;
  for (let i = 0; i < fp.length; i++) {
    const [ax, az] = fp[i];
    const [bx, bz] = fp[(i + 1) % fp.length];
    pts.push(ax, h + 0.2, az, bx, h + 0.2, bz); // roof edge
    pts.push(ax, 0.3, az, bx, 0.3, bz); // base
    pts.push(ax, 0.3, az, ax, h + 0.2, az); // corner
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 });
  return new THREE.LineSegments(geo, mat);
}
