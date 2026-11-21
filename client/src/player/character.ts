// character.ts - a simple capsule person that walks with the keyboard.
// (Later we can swap the capsule for a Kenney .glb model.)

import * as THREE from 'three';
import { isDown, type KeyMap } from './input';

const WALK_SPEED = 5; // metres per second
const RUN_SPEED = 10;

export class Character {
  readonly mesh = new THREE.Group();
  readonly velocity = new THREE.Vector3(); // used by the camera to zoom out
  private keys: KeyMap;

  constructor(keys: KeyMap, color = 0xff8c1a) {
    this.keys = keys;

    // Body: capsule 1.8 m tall (radius 0.35, middle part 1.1).
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 4, 12),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
    );
    body.position.y = 0.9; // stand on the ground, not half underneath it
    // NOTE: a real 1.8 m person is tiny from 100 m up, so we draw them 2x big
    // (classic top-down game trick).
    this.mesh.scale.setScalar(2);
    this.mesh.add(body);

    // A small "nose" box so you can see which way the person faces.
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    nose.position.set(0, 1.4, -0.4); // -z = forward
    this.mesh.add(nose);
  }

  update(dt: number) {
    // Build a direction from the keys. The camera always looks north,
    // so "up" on screen = north = -z.
    const dir = new THREE.Vector3();
    if (isDown(this.keys.up)) dir.z -= 1;
    if (isDown(this.keys.down)) dir.z += 1;
    if (isDown(this.keys.left)) dir.x -= 1;
    if (isDown(this.keys.right)) dir.x += 1;

    if (dir.lengthSq() > 0) {
      dir.normalize(); // so diagonals aren't faster
      const speed = isDown(this.keys.run) ? RUN_SPEED : WALK_SPEED;
      this.velocity.copy(dir).multiplyScalar(speed);
      // Turn to face where we're walking (forward is -z, hence the minus signs).
      this.mesh.rotation.y = Math.atan2(-dir.x, -dir.z);
    } else {
      this.velocity.set(0, 0, 0);
    }

    // NOTE: no building collisions yet - that's Step 2.
    this.mesh.position.addScaledVector(this.velocity, dt);
  }
}
