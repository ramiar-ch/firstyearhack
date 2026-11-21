// london.ts - loads public/data/london.json (made by scripts/fetch-osm.mjs)
// and turns it into 3D meshes: dark extruded buildings + flat road strips.
//
// Coordinates in the JSON are already in metres: x = east, z = south.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- Types matching the JSON file ------------------------------------------
type Point = [number, number]; // [x, z]

export interface Building {
  height: number;
  name: string;
  footprint: Point[];
  kcl?: boolean; // true for the KCL Strand Building
}

export interface Road {
  type: string;
  name: string;
  width: number;
  points: Point[];
}

export interface LondonData {
  attribution: string;
  radius: number;
  spawn: { x: number; z: number };
  buildings: Building[];
  roads: Road[];
}

export async function loadLondonData(): Promise<LondonData> {
  const res = await fetch('/data/london.json');
  if (!res.ok) throw new Error('Could not load london.json - did you run "npm.cmd run fetch-osm"?');
  return res.json();
}

// ---- Buildings ----------------------------------------------------------------
// One ExtrudeGeometry per building, then merged into ONE big geometry so the
// GPU draws thousands of buildings in a single draw call.
function buildingGeometry(b: Building): THREE.BufferGeometry {
  // A Shape lives in a 2D (x, y) plane. We use y = -z so that after rotating
  // the extrusion to stand upright, the footprint lands on the right spot.
  const shape = new THREE.Shape(b.footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // extrusion was along +z, now it points up (+y)
  return geo;
}

export function createBuildings(data: LondonData): THREE.Group {
  const group = new THREE.Group();
  const normal: THREE.BufferGeometry[] = [];
  const kcl: THREE.BufferGeometry[] = [];

  for (const b of data.buildings) {
    try {
      (b.kcl ? kcl : normal).push(buildingGeometry(b));
    } catch {
      // A few OSM shapes are broken (self-intersecting etc.) - just skip them.
    }
  }

  // Dark blue-grey blocks for the city.
  const cityMat = new THREE.MeshStandardMaterial({ color: 0x2c3954, roughness: 0.9 });
  group.add(new THREE.Mesh(mergeGeometries(normal), cityMat));

  // The KCL Strand Building glows a little orange so you can find it.
  if (kcl.length) {
    const kclMat = new THREE.MeshStandardMaterial({
      color: 0x3a2a18,
      emissive: 0xff8c1a,
      emissiveIntensity: 0.25,
    });
    group.add(new THREE.Mesh(mergeGeometries(kcl), kclMat));
  }
  return group;
}

// ---- Roads ----------------------------------------------------------------------
// Each road is a polyline. For every segment we make a flat rectangle
// (2 triangles) `width` metres wide, lying just above the ground.
export function createRoads(data: LondonData): THREE.Mesh {
  const positions: number[] = [];
  const Y = 0.05; // tiny lift above the ground plane to avoid flickering

  for (const road of data.roads) {
    const half = road.width / 2;
    for (let i = 0; i < road.points.length - 1; i++) {
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      // Unit direction along the segment, and a sideways (perpendicular) vector.
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const sx = -dz * half, sz = dx * half;
      // Stretch each end by half the width so corners don't show gaps.
      const ex = dx * half, ez = dz * half;
      const p1 = [ax - ex + sx, Y, az - ez + sz];
      const p2 = [ax - ex - sx, Y, az - ez - sz];
      const p3 = [bx + ex + sx, Y, bz + ez + sz];
      const p4 = [bx + ex - sx, Y, bz + ez - sz];
      // Two triangles (counter-clockwise seen from above so they face up).
      positions.push(...p1, ...p3, ...p2, ...p2, ...p3, ...p4);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a4f5c, roughness: 0.6 });
  return new THREE.Mesh(geo, mat);
}

// ---- Ground ---------------------------------------------------------------------
export function createGround(radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius + 300, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x12151d, roughness: 1 });
  return new THREE.Mesh(geo, mat);
}
