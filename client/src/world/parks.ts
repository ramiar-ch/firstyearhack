// parks.ts - dark green parks/grass and low-poly trees.
//
// Trees use InstancedMesh: ONE trunk mesh + ONE leaves mesh, drawn hundreds
// of times with different positions/sizes in a single draw call each.

import * as THREE from 'three';
import type { Point } from './data';
import { addPolygon, flatMesh, pointInPolygon, seededRandom } from './geometry';

export function createParks(parks: Point[][], plazas: Point[][] = []): THREE.Group {
  const grass: number[] = [];
  for (const poly of parks) addPolygon(grass, poly, 0.02);
  // Paved squares (e.g. Somerset House courtyard) and piers: pavement colour.
  const paving: number[] = [];
  for (const poly of plazas) addPolygon(paving, poly, 0.04);
  const group = new THREE.Group();
  group.add(
    flatMesh(grass, new THREE.MeshStandardMaterial({ color: 0x18301f, roughness: 1 })),
    flatMesh(paving, new THREE.MeshStandardMaterial({ color: 0x4d5058, roughness: 0.9 })),
  );
  return group;
}

/** OSM trees + a few extra trees scattered inside parks. */
export function createTrees(osmTrees: Point[], parks: Point[][]): THREE.Group {
  const rand = seededRandom(99);
  const spots: Point[] = [...osmTrees];

  // Roughly one extra tree per 250 m² of park (OSM rarely maps every park tree).
  for (const poly of parks) {
    const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const tries = Math.min(200, ((maxX - minX) * (maxZ - minZ)) / 250);
    for (let i = 0; i < tries; i++) {
      const x = minX + rand() * (maxX - minX), z = minZ + rand() * (maxZ - minZ);
      if (pointInPolygon(x, z, poly)) spots.push([x, z]);
    }
  }

  // Shapes: a thin trunk and a chunky low-poly "blob" of leaves.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 5);
  trunkGeo.translate(0, 1.5, 0); // stand on the ground
  const leavesGeo = new THREE.IcosahedronGeometry(2.6, 0);
  leavesGeo.translate(0, 5, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeo, new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 1 }), spots.length);
  const leaves = new THREE.InstancedMesh(
    leavesGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const colour = new THREE.Color();
  spots.forEach(([x, z], i) => {
    const s = 0.8 + rand() * 0.6; // size
    q.setFromAxisAngle(new THREE.Object3D().up, rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    // Slightly different greens (London plane trees at night).
    leaves.setColorAt(i, colour.setHSL(0.27 + rand() * 0.06, 0.35, 0.12 + rand() * 0.06));
  });

  const group = new THREE.Group();
  group.add(trunks, leaves);
  return group;
}
