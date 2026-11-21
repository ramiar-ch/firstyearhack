// props.ts - London street furniture, all drawn with InstancedMesh:
//   - sodium-orange street lamps every ~25 m along streets
//   - red phone boxes near landmarks
//   - bus stops along the big roads
//   - Belisha beacons (orange globes on poles) at zebra crossings
// One InstancedMesh per part = a few draw calls for thousands of objects.

import * as THREE from 'three';
// mergeGeometries joins several pieces into one geometry (sharing one material).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isStreet, nearestStreet, type LondonData } from './data';
import { walkAlong } from './geometry';
import type { CollisionWorld } from './collision';
import type { Zebra } from './markings';
import { PAVEMENT_WIDTH } from './roads';

interface Placement {
  x: number;
  z: number;
  angle: number; // rotation around the vertical axis
}

/** Make one InstancedMesh that draws `geo` at every placement. */
function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, places: Placement[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, places.length);
  const obj = new THREE.Object3D();
  places.forEach((p, i) => {
    obj.position.set(p.x, 0, p.z);
    obj.rotation.set(0, p.angle, 0);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
  });
  return mesh;
}

/** A box sitting with its bottom at height y0 (and optionally moved sideways). */
function box(w: number, h: number, d: number, y0: number, x = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z);
}

const BUS_ROADS = new Set(['Strand', 'Aldwych', 'Kingsway', 'Waterloo Bridge', 'Fleet Street']);

export function createProps(data: LondonData, world: CollisionWorld, zebras: Zebra[]): THREE.Group {
  const group = new THREE.Group();

  // ---- Street lamps ------------------------------------------------------------
  const lamps: Placement[] = [];
  const taken = new Set<string>(); // 8 m grid cells that already have a lamp
  for (const road of data.roads) {
    if (!isStreet(road) && !road.bridge) continue;
    let n = 0;
    walkAlong(road.points, 25, 6, (x, z, dx, dz) => {
      const side = n++ % 2 === 0 ? 1 : -1; // alternate sides of the road
      const off = (road.width / 2 + 0.6) * side; // on the pavement, near the kerb
      const lx = x - dz * off, lz = z + dx * off;
      const key = `${Math.round(lx / 8)},${Math.round(lz / 8)}`;
      if (taken.has(key) || world.isBlocked(lx, lz, 0.4)) return;
      taken.add(key);
      // The arm points +x in the model; turn it so it hangs over the road.
      const heading = Math.atan2(-dx, -dz);
      lamps.push({ x: lx, z: lz, angle: side > 0 ? heading + Math.PI : heading });
    });
  }
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5, 0), // pole
    box(1.6, 0.12, 0.12, 6.9, 0.8), // arm towards the road
  ]);
  const headGeo = box(0.7, 0.18, 0.35, 6.75, 1.5); // the glowing lamp
  group.add(
    instanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.6 }), lamps),
    instanced(headGeo, new THREE.MeshBasicMaterial({ color: 0xffa23a }), lamps), // sodium orange
  );

  // ---- Red phone boxes near landmarks -----------------------------------------
  const phones: Placement[] = [];
  // Real phone boxes from OSM, but only the ones near our landmarks.
  for (const [x, z] of data.phoneBoxes ?? []) {
    if (!data.landmarks.some((lm) => Math.hypot(lm.x - x, lm.z - z) < 150)) continue;
    if (world.isBlocked(x, z, 0.6)) continue;
    const s = nearestStreet(data, x, z);
    phones.push({ x, z, angle: Math.atan2(-s.dx, -s.dz) });
  }
  // No real ones in the data? Put one next to each landmark ourselves.
  for (const lm of phones.length ? [] : data.landmarks) {
    // Nearest lamp to the landmark = a spot on a pavement. Put the box next to it.
    let best: Placement | null = null, bestD = 120;
    for (const l of lamps) {
      const d = Math.hypot(l.x - lm.x, l.z - lm.z);
      if (d < bestD) { bestD = d; best = l; }
    }
    if (!best) continue;
    const along = { x: -Math.sin(best.angle), z: -Math.cos(best.angle) };
    const px = best.x + along.x * 2.5, pz = best.z + along.z * 2.5;
    if (!world.isBlocked(px, pz, 0.8)) phones.push({ x: px, z: pz, angle: best.angle });
  }
  const S = 1.3; // a bit bigger than real, to be visible from above
  group.add(
    instanced(box(1 * S, 2.4 * S, 1 * S, 0), new THREE.MeshStandardMaterial({ color: 0xc8161e, roughness: 0.5 }), phones),
    instanced(box(1.1 * S, 0.25 * S, 1.1 * S, 2.4 * S), new THREE.MeshStandardMaterial({ color: 0x8a0f14 }), phones),
    // glowing "TELEPHONE" strip under the roof
    instanced(box(1.02 * S, 0.15 * S, 1.02 * S, 2.2 * S), new THREE.MeshBasicMaterial({ color: 0xfff2d8 }), phones),
  );

  // ---- Bus stops along the big roads -------------------------------------------
  const stops: Placement[] = [];
  // Real bus stops from OSM: line each one up with its street, on the pavement.
  for (const [x, z] of data.busStops ?? []) {
    const s = nearestStreet(data, x, z);
    if (s.dist > s.halfWidth + 8) continue;
    // Which side of the street is the stop on? (+1 = right of the street direction)
    const side = (x - s.x) * -s.dz + (z - s.z) * s.dx >= 0 ? 1 : -1;
    const off = (s.halfWidth + PAVEMENT_WIDTH * 0.6) * side;
    const sx = s.x - s.dz * off, sz = s.z + s.dx * off;
    if (world.isBlocked(sx, sz, 1)) continue;
    const heading = Math.atan2(-s.dx, -s.dz);
    // The shelter model faces the road at +x: flip it for stops on the right.
    stops.push({ x: sx, z: sz, angle: side > 0 ? heading + Math.PI : heading });
  }
  // No real ones? Make our own every ~220 m along the big roads.
  for (const road of stops.length ? [] : data.roads) {
    if (!BUS_ROADS.has(road.name) || road.bridge) continue;
    walkAlong(road.points, 220, 40, (x, z, dx, dz) => {
      // UK buses drive on the left, so stops are on the LEFT pavement.
      const off = -(road.width / 2 + PAVEMENT_WIDTH * 0.6);
      const sx = x - dz * off, sz = z + dx * off;
      if (stops.some((s) => Math.hypot(s.x - sx, s.z - sz) < 120)) return;
      if (world.isBlocked(sx, sz, 1.5)) return;
      stops.push({ x: sx, z: sz, angle: Math.atan2(-dx, -dz) });
    });
  }
  // Model: shelter runs along local z (the road direction), road is at +x.
  group.add(
    instanced(box(1.4, 0.15, 4, 2.5), new THREE.MeshStandardMaterial({ color: 0x2c3038 }), stops), // roof
    instanced(box(0.1, 2.3, 4, 0.2, -0.65), new THREE.MeshBasicMaterial({ color: 0x5f7fb8 }), stops), // lit advert panel
    instanced(mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.06, 3, 5).translate(0.6, 1.5, 2.6),
    ]), new THREE.MeshStandardMaterial({ color: 0x9a9ca2 }), stops), // sign pole
    instanced(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16).rotateZ(Math.PI / 2).translate(0.6, 3.1, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xd8202a }), stops), // red roundel sign
  );

  // ---- Belisha beacons at zebra crossings --------------------------------------
  const beacons: Placement[] = [];
  for (const zb of zebras) {
    for (const side of [-1, 1]) {
      const off = (zb.halfWidth + 0.8) * side;
      beacons.push({ x: zb.x - zb.dz * off, z: zb.z + zb.dx * off, angle: 0 });
    }
  }
  group.add(
    instanced(new THREE.CylinderGeometry(0.08, 0.08, 3, 6).translate(0, 1.5, 0),
      new THREE.MeshStandardMaterial({ color: 0xdedede }), beacons),
    instanced(new THREE.SphereGeometry(0.35, 10, 8).translate(0, 3.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xff9a1a }), beacons),
  );

  return group;
}
