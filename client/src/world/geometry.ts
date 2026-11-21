// geometry.ts - small helpers for building flat map geometry.
//
// Everything flat (roads, pavements, water, parks, markings) is pushed into
// plain number arrays of triangle corners [x, y, z, x, y, z, ...] and then
// turned into ONE mesh per material. One mesh = one draw call = fast.

import * as THREE from 'three';
import type { Point } from './data';

/**
 * Adds a flat rectangle along the segment a->b.
 *   halfWidth: half the rectangle's width
 *   offset:    shift sideways (+ = to the RIGHT of a->b, - = to the left)
 *   extend:    stretch both ends by this much (hides gaps at corners)
 */
export function addSegment(
  out: number[], a: Point, b: Point, halfWidth: number, y: number, offset = 0, extend = 0,
) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.01) return;
  const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len; // along
  const rx = -dz, rz = dx; // to the right
  const ax = a[0] - dx * extend + rx * offset, az = a[1] - dz * extend + rz * offset;
  const bx = b[0] + dx * extend + rx * offset, bz = b[1] + dz * extend + rz * offset;
  const sx = rx * halfWidth, sz = rz * halfWidth;
  // 4 corners: start-right, start-left, end-right, end-left
  const p1 = [ax + sx, y, az + sz], p2 = [ax - sx, y, az - sz];
  const p3 = [bx + sx, y, bz + sz], p4 = [bx - sx, y, bz - sz];
  out.push(...p1, ...p3, ...p2, ...p2, ...p3, ...p4); // 2 triangles, facing up
}

/** A flat strip along a whole polyline. */
export function addStrip(out: number[], points: Point[], halfWidth: number, y: number, offset = 0) {
  for (let i = 0; i < points.length - 1; i++) {
    addSegment(out, points[i], points[i + 1], halfWidth, y, offset, offset === 0 ? halfWidth : 0);
  }
}

/** Fill a polygon (flat, at height y). */
export function addPolygon(out: number[], poly: Point[], y: number) {
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
  let tris: number[][];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, []);
  } catch {
    return; // broken shape - skip it
  }
  for (const [i, j, k] of tris) {
    const a = poly[i], b = poly[j], c = poly[k];
    // Make sure the triangle faces UP (swap two corners if it faces down).
    const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
    const [p, q] = up ? [b, c] : [c, b];
    out.push(a[0], y, a[1], p[0], y, p[1], q[0], y, q[1]);
  }
}

/** Turn a flat position array into a mesh (all normals point straight up). */
export function flatMesh(positions: number[], material: THREE.Material, uvScale = 0): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (uvScale) {
    // Texture coordinates from world x/z (for water ripples etc.)
    const uvs = new Float32Array((positions.length / 3) * 2);
    for (let v = 0; v < positions.length / 3; v++) {
      uvs[v * 2] = positions[v * 3] * uvScale;
      uvs[v * 2 + 1] = positions[v * 3 + 2] * uvScale;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  return new THREE.Mesh(geo, material);
}

/** Walk along a polyline and call fn every `step` metres (with direction). */
export function walkAlong(
  points: Point[], step: number, start: number,
  fn: (x: number, z: number, dx: number, dz: number, distance: number) => void,
) {
  let next = start; // distance of the next callback
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    while (next <= travelled + len) {
      const t = next - travelled;
      fn(ax + dx * t, az + dz * t, dx, dz, next);
      next += step;
    }
    travelled += len;
  }
}

/** Total length of a polyline in metres. */
export function polylineLength(points: Point[]): number {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return len;
}

/** Same random numbers every time the game loads (so the city looks the same). */
export function seededRandom(seed = 12345): () => number {
  let s = seed >>> 0;
  return () => {
    // mulberry32 - a tiny, decent random number generator
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pointInPolygon(px: number, pz: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
