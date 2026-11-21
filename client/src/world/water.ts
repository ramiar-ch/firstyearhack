// water.ts - the River Thames (and fountains/ponds): dark, shiny, gently moving.
//
// The "movement" is cheap: a ripple normal map whose position slides a tiny
// bit every frame, so the reflected sky glow wobbles like water.

import * as THREE from 'three';
import type { Point } from './data';
import { addPolygon, flatMesh } from './geometry';
import { createNightEnvironment, createWaterNormalTexture } from './textures';

export function createWater(polygons: Point[][]) {
  const positions: number[] = [];
  for (const poly of polygons) addPolygon(positions, poly, 0.03);

  const normalMap = createWaterNormalTexture();
  const material = new THREE.MeshStandardMaterial({
    color: 0x1a3352, // deep night blue
    roughness: 0.3,
    metalness: 0.6, // reflective
    envMap: createNightEnvironment(), // what it reflects
    envMapIntensity: 2.5,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  // uvScale 1/30: the ripple pattern repeats every 30 m.
  const mesh = flatMesh(positions, material, 1 / 30);

  return {
    mesh,
    /** Call every frame: slowly drift the ripples (the Thames flows east). */
    update(dt: number) {
      normalMap.offset.x += dt * 0.012;
      normalMap.offset.y += dt * 0.004;
    },
  };
}
