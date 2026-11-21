// world/index.ts - builds the whole London map from london.json and adds it
// to the scene. Returns an update() for the bits that move (water, labels).

import * as THREE from 'three';
import type { LondonData } from './data';
import type { CollisionWorld } from './collision';
import { createBuildings } from './buildings';
import { createRoads } from './roads';
import { createMarkings } from './markings';
import { createWater } from './water';
import { createParks, createTrees } from './parks';
import { createProps } from './props';
import { createLabels } from './labels';

export function buildWorld(
  scene: THREE.Scene, data: LondonData, collision: CollisionWorld, renderer: THREE.WebGLRenderer,
) {
  // Ground: dark earth under everything.
  const groundGeo = new THREE.CircleGeometry(data.radius + 400, 64).rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 1 })));

  const water = createWater(data.water);
  scene.add(water.mesh);
  scene.add(createParks(data.parks, data.plazas));
  scene.add(createRoads(data));
  const markings = createMarkings(data, data.spawn);
  scene.add(markings.group);
  scene.add(createBuildings(data.buildings, renderer.capabilities.getMaxAnisotropy()));
  scene.add(createTrees(data.trees, data.parks));
  scene.add(createProps(data, collision, markings.zebras));
  const labels = createLabels(data.landmarks);
  scene.add(labels.group);

  return {
    update(dt: number, focus: THREE.Vector3) {
      water.update(dt);
      labels.update(focus);
    },
  };
}
