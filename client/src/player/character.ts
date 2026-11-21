// character.ts - a person you control on foot: moves with the keyboard,
// bumps into buildings, and drives the CharacterModel animations.

import * as THREE from 'three';
import { isDown, type KeyMap } from './input';
import { CharacterModel, type CharacterConfig } from './characterModel';
import type { CollisionWorld } from '../world/collision';

const WALK_SPEED = 5; // metres per second
const RUN_SPEED = 10;
const RADIUS = 0.8; // collision circle (the person is drawn 2x size)

export class Character {
  readonly model: CharacterModel;
  readonly velocity = new THREE.Vector3(); // used by the camera to zoom out
  private keys: KeyMap;
  private running = false;

  constructor(keys: KeyMap, config: CharacterConfig, ringColour: number) {
    this.keys = keys;
    this.model = new CharacterModel(config, ringColour);
  }

  /** The 3D object (add to the scene, read/set its position). */
  get mesh(): THREE.Group {
    return this.model.root;
  }

  /** enabled = false during the intro / creator: stand still but keep animating. */
  update(dt: number, world: CollisionWorld, enabled = true) {
    // Build a direction from the keys. The camera always looks north,
    // so "up" on screen = north = -z.
    const dir = new THREE.Vector3();
    if (enabled) {
      if (isDown(this.keys.up)) dir.z -= 1;
      if (isDown(this.keys.down)) dir.z += 1;
      if (isDown(this.keys.left)) dir.x -= 1;
      if (isDown(this.keys.right)) dir.x += 1;
    }

    if (dir.lengthSq() > 0) {
      dir.normalize(); // so diagonals aren't faster
      this.running = isDown(this.keys.run);
      this.velocity.copy(dir).multiplyScalar(this.running ? RUN_SPEED : WALK_SPEED);
      // Turn to face where we're walking (forward is -z, hence the minus signs).
      this.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    } else {
      this.velocity.set(0, 0, 0);
    }

    const before = this.mesh.position.clone();
    this.mesh.position.addScaledVector(this.velocity, dt);
    // Don't walk through buildings.
    world.resolveCircle(this.mesh.position, RADIUS);
    // Don't walk into the Thames: just stay where we were.
    if (world.isWater(this.mesh.position.x, this.mesh.position.z)) this.mesh.position.copy(before);

    this.model.update(dt, this.velocity.length(), this.running);
  }
}
