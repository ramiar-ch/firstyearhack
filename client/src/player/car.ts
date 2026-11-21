// car.ts - a box car with arcade driving (no physics engine!).
//
// The whole car is described by just 3 numbers:
//   position (x, z), heading (which way it points), speed (m/s along heading)
// Every frame: throttle/brake change speed, drag slows it down, steering
// turns the heading (more when going faster), then we move forwards.

import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';

// ---- Tuning knobs (play with these!) ---------------------------------------
const ACCELERATION = 18; // m/s per second when holding throttle
const BRAKE = 35; // m/s per second when braking
const REVERSE_ACCEL = 10;
const MAX_SPEED = 32; // m/s (~115 km/h - it's a game)
const MAX_REVERSE = 9;
const DRAG = 0.6; // air drag: bigger = slows faster at high speed
const ROLLING = 3; // m/s per second lost when coasting
const TURN_RATE = 2.4; // radians per second at full steering
const HANDBRAKE_TURN = 1.6; // extra turning when handbraking

// Car size (a bit bigger than real life so it reads well from up high).
const LENGTH = 6;
const WIDTH = 2.8;
// Collision: two circles, one near the front and one near the back.
const CIRCLE_OFFSET = 1.6;
const CIRCLE_RADIUS = 1.4;

export interface DriveInput {
  throttle: number; // 0..1
  brake: number; // 0..1  (also reverse when stopped)
  steer: number; // -1 = right .. +1 = left
  handbrake: boolean;
}

export const NO_INPUT: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

export class Car {
  readonly mesh = new THREE.Group();
  speed = 0;
  occupied = false;

  constructor(x: number, z: number, heading: number, color = 0x2a5bd7) {
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;

    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.3 });

    // Lower body
    const body = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 1.0, LENGTH), paint);
    body.position.y = 0.8;
    // Cabin (dark windows), slightly towards the back
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.85, 0.8, LENGTH * 0.5), dark);
    cabin.position.set(0, 1.7, 0.4);
    // Roof in paint colour on top of the cabin
    const roof = new THREE.Mesh(new THREE.BoxGeometry(WIDTH * 0.8, 0.1, LENGTH * 0.45), paint);
    roof.position.set(0, 2.15, 0.4);
    this.mesh.add(body, cabin, roof);

    // Headlights (front = -z) and tail lights (back = +z).
    // Just glowing boxes for now; real light beams come in Step 4.
    const head = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.1), head);
      h.position.set(side * (WIDTH / 2 - 0.45), 0.9, -LENGTH / 2 - 0.05);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.1), tail);
      t.position.set(side * (WIDTH / 2 - 0.45), 0.9, LENGTH / 2 + 0.05);
      this.mesh.add(h, t);
    }
  }

  get position() {
    return this.mesh.position;
  }

  get heading() {
    return this.mesh.rotation.y;
  }

  // Unit vector the car is pointing (local -z turned by the heading).
  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  update(dt: number, input: DriveInput, world: CollisionWorld) {
    // ---- 1. Speed -----------------------------------------------------------
    if (input.throttle > 0) {
      this.speed += ACCELERATION * input.throttle * dt;
    }
    if (input.brake > 0) {
      // Moving forward -> brake. Stopped or reversing -> drive backwards.
      this.speed -= (this.speed > 0.5 ? BRAKE : REVERSE_ACCEL) * input.brake * dt;
    }
    if (input.handbrake) this.speed *= 1 - 1.5 * dt;

    // Drag (grows with speed) + rolling resistance (when not pressing anything).
    this.speed -= this.speed * DRAG * dt * (Math.abs(this.speed) / MAX_SPEED);
    if (input.throttle === 0 && input.brake === 0) {
      const slow = ROLLING * dt;
      this.speed = Math.abs(this.speed) < slow ? 0 : this.speed - Math.sign(this.speed) * slow;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -MAX_REVERSE, MAX_SPEED);

    // ---- 2. Steering ------------------------------------------------------
    // You can't turn a car standing still, so turning scales with speed
    // (up to full at 8 m/s). Negative speed = reversing = steering flips, like real cars.
    const speedFactor = THREE.MathUtils.clamp(this.speed / 8, -1, 1);
    const turn = TURN_RATE + (input.handbrake ? HANDBRAKE_TURN : 0);
    this.mesh.rotation.y += input.steer * turn * speedFactor * dt;

    // ---- 3. Move ----------------------------------------------------------
    const fwd = this.forward();
    this.position.addScaledVector(fwd, this.speed * dt);

    // ---- 4. Collide with buildings ----------------------------------------
    const push = new THREE.Vector3();
    for (const offset of [CIRCLE_OFFSET, -CIRCLE_OFFSET]) {
      const c = this.position.clone().addScaledVector(fwd, offset);
      const before = c.clone();
      if (world.resolveCircle(c, CIRCLE_RADIUS)) push.add(c.sub(before));
    }
    if (push.lengthSq() > 0) {
      this.position.add(push);
      // How "head-on" was the crash? 1 = straight into the wall, 0 = scraping along it.
      const n = push.clone().normalize();
      const headOn = Math.max(0, -fwd.dot(n) * Math.sign(this.speed));
      if (headOn > 0.7 && Math.abs(this.speed) > 5) {
        // Proper crash: bounce back a little.
        this.speed *= -0.3;
      } else {
        // Scraping along a wall: lose a bit of speed (headOn² is small for
        // shallow angles, so a light scrape barely slows you down).
        this.speed *= 1 - headOn * headOn;
      }
    }
  }
}
