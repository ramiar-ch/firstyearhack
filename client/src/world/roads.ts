// roads.ts - roads, pavements, footpaths and bridge walls.
//
// Layers (from the ground up, a few cm apart so they don't flicker):
//   0.08  footpaths (OSM footway/path/steps)
//   0.10  pavements: a wide strip under every street, so it sticks out each side
//   0.11  kerbs: a thin light line where pavement meets road
//   0.12  road surface (covers the pavement in the middle - and at junctions,
//         covers the other road's pavement, so junctions look right)
// Road markings sit on top at 0.135 (see markings.ts).

import * as THREE from 'three';
import { isCarRoad, isStreet, type LondonData, type Road } from './data';
import { addStrip, flatMesh } from './geometry';

export const PAVEMENT_WIDTH = 2.5; // metres each side of a street
export const ROAD_Y = 0.12;

export function createRoads(data: LondonData): THREE.Group {
  const asphalt: number[] = [];
  const pavement: number[] = [];
  const kerb: number[] = [];
  const footpath: number[] = [];
  const parapets: number[] = []; // bridge side walls (vertical)

  for (const road of data.roads) {
    const half = road.width / 2;
    if (!isCarRoad(road)) {
      // Pedestrian streets (like the Strand outside KCL) are paved all over;
      // little footpaths are narrower and a bit darker.
      if (road.type === 'pedestrian') addStrip(pavement, road.points, half, 0.1);
      else addStrip(footpath, road.points, half, 0.08);
      continue;
    }
    addStrip(asphalt, road.points, half, ROAD_Y);
    if (isStreet(road) || road.bridge) {
      addStrip(pavement, road.points, half + PAVEMENT_WIDTH, 0.1);
      addStrip(kerb, road.points, 0.15, 0.11, half + 0.15);
      addStrip(kerb, road.points, 0.15, 0.11, -(half + 0.15));
    }
    if (road.bridge) addParapets(parapets, road);
  }

  const group = new THREE.Group();
  group.add(
    flatMesh(asphalt, new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.7 })),
    flatMesh(pavement, new THREE.MeshStandardMaterial({ color: 0x55585f, roughness: 0.9 })),
    flatMesh(kerb, new THREE.MeshStandardMaterial({ color: 0x8a8c92, roughness: 0.9 })),
    flatMesh(footpath, new THREE.MeshStandardMaterial({ color: 0x45474e, roughness: 0.9 })),
  );

  // Bridge walls are vertical, so they need real normals.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(parapets, 3));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.9, side: THREE.DoubleSide })));
  return group;
}

/** Low stone walls (1.2 m high) along both edges of a bridge (outside its pavements). */
function addParapets(out: number[], road: Road) {
  const H = 1.2;
  const edge = road.width / 2 + PAVEMENT_WIDTH;
  for (let i = 0; i < road.points.length - 1; i++) {
    const [ax, az] = road.points[i];
    const [bx, bz] = road.points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const rx = -(bz - az) / len, rz = (bx - ax) / len; // to the right
    for (const side of [-1, 1]) {
      const ox = rx * edge * side, oz = rz * edge * side;
      const p = [ax + ox, 0, az + oz], q = [bx + ox, 0, bz + oz];
      const pt = [p[0], H, p[2]], qt = [q[0], H, q[2]];
      out.push(...p, ...q, ...qt, ...p, ...qt, ...pt);
    }
  }
}
