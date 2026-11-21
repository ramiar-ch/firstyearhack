// car.ts - a box car with arcade driving (no physics engine!).
//
// The car has a position, a heading (which way it points) and a VELOCITY
// (which way it's actually moving). Normally the tyres "grip" and the velocity
// is pulled into line with the heading. With the handbrake (Space) the grip
// drops, so the back slides out = DRIFT.
//
// Every frame:
//   1. split velocity into "forward" and "sideways" parts
//   2. throttle / brake / drag change the forward part
//   3. tyre grip shrinks the sideways part (less grip when handbraking)
//   4. steering turns the heading (more when going faster)
//   5. move, then push out of buildings (that's a crash if it was hard)

import * as THREE from 'three';
import type { CollisionWorld } from '../world/collision';

// ---- Tuning knobs (play with these!) ---------------------------------------
const ACCELERATION = 18; // m/s per second when holding throttle
const BRAKE = 35; // m/s per second when braking
const REVERSE_ACCEL = 10;
const MAX_SPEED = 32; // m/s (~70 mph - it's a game)
const MAX_REVERSE = 9;
const DRAG = 0.6; // air drag: bigger = slows faster at high speed
const ROLLING = 3; // m/s per second lost when coasting
const TURN_RATE = 2.4; // radians per second at full steering
const GRIP = 10; // how fast sideways sliding is killed (normal driving)
const DRIFT_GRIP = 2; // ...and while handbraking (low = long slides)
const HANDBRAKE_TURN = 0.8; // extra turning while handbraking
const HANDBRAKE_SLOW = 0.8; // forward speed lost per second while handbraking

// A crash = hitting a wall at more than this speed (m/s) towards the wall.
const CRASH_SPEED = 4;
const CRASH_COOLDOWN = 0.6; // seconds, so one crash isn't counted 30 times

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
  readonly velocity = new THREE.Vector3(); // metres per second, world space
  occupied = false;
  private crashCooldown = 0;

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
    // Just glowing boxes for now; real light beams come later.
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

  /** Speed in the direction the car points (negative = reversing). */
  get speed(): number {
    return this.velocity.dot(this.forward());
  }

  // Unit vector the car is pointing (local -z turned by the heading).
  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  // Unit vector pointing out of the car's right-hand side.
  right(): THREE.Vector3 {
    const f = this.forward();
    return new THREE.Vector3(-f.z, 0, f.x);
  }

  /**
   * Moves the car one frame.
   * Returns true if the car CRASHED into a building this frame.
   */
  update(dt: number, input: DriveInput, world: CollisionWorld): boolean {
    this.crashCooldown -= dt;

    // ---- 1. Split velocity into forward + sideways ------------------------
    let fwd = this.forward();
    let speed = this.velocity.dot(fwd); // forward part
    let slide = this.velocity.dot(this.right()); // sideways part

    // ---- 2. Throttle, brake, drag ----------------------------------------
    if (input.throttle > 0) speed += ACCELERATION * input.throttle * dt;
    if (input.brake > 0) {
      // Moving forward -> brake. Stopped or reversing -> drive backwards.
      speed -= (speed > 0.5 ? BRAKE : REVERSE_ACCEL) * input.brake * dt;
    }
    if (input.handbrake) speed -= speed * HANDBRAKE_SLOW * dt;

    // Drag (grows with speed) + rolling resistance (when not pressing anything).
    speed -= speed * DRAG * dt * (Math.abs(speed) / MAX_SPEED);
    if (input.throttle === 0 && input.brake === 0) {
      const slow = ROLLING * dt;
      speed = Math.abs(speed) < slow ? 0 : speed - Math.sign(speed) * slow;
    }
    speed = THREE.MathUtils.clamp(speed, -MAX_REVERSE, MAX_SPEED);

    // ---- 3. Tyre grip: kill sideways sliding -----------------------------
    // exp() makes this smooth and the same at any frame rate.
    const grip = input.handbrake ? DRIFT_GRIP : GRIP;
    slide *= Math.exp(-grip * dt);

    // ---- 4. Steering ------------------------------------------------------
    // You can't turn a car standing still, so turning scales with speed
    // (up to full at 8 m/s). Negative speed = reversing = steering flips.
    const speedFactor = THREE.MathUtils.clamp(speed / 8, -1, 1);
    const turn = TURN_RATE + (input.handbrake ? HANDBRAKE_TURN : 0);
    this.mesh.rotation.y += input.steer * turn * speedFactor * dt;

    // Rebuild the velocity from the parts, using the OLD direction vectors.
    // Because the car has just turned, the old "forward" is now partly
    // sideways - that's what makes the back slide out when grip is low.
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.velocity.copy(fwd).multiplyScalar(speed).addScaledVector(right, slide);

    // ---- 5. Move ----------------------------------------------------------
    const before = this.position.clone();
    this.position.addScaledVector(this.velocity, dt);

    // The river: if the front or back of the car would be in the water,
    // stay put and stop (a crash if we were going fast).
    const f = this.forward();
    for (const offset of [CIRCLE_OFFSET + CIRCLE_RADIUS, -CIRCLE_OFFSET - CIRCLE_RADIUS]) {
      if (world.isWater(this.position.x + f.x * offset, this.position.z + f.z * offset)) {
        this.position.copy(before);
        const fast = this.velocity.length() > CRASH_SPEED;
        this.velocity.multiplyScalar(-0.2);
        if (fast && this.crashCooldown <= 0) {
          this.crashCooldown = CRASH_COOLDOWN;
          return true;
        }
        return false;
      }
    }

    // ---- 6. Collide with buildings ----------------------------------------
    fwd = this.forward();
    const push = new THREE.Vector3();
    for (const offset of [CIRCLE_OFFSET, -CIRCLE_OFFSET]) {
      const c = this.position.clone().addScaledVector(fwd, offset);
      const before = c.clone();
      if (world.resolveCircle(c, CIRCLE_RADIUS)) push.add(c.sub(before));
    }
    if (push.lengthSq() === 0) return false;

    this.position.add(push);
    // n = direction pointing away from the wall.
    const n = push.normalize();
    const intoWall = -this.velocity.dot(n); // how fast we were going INTO the wall
    if (intoWall <= 0) return false;

    // Remove the "into the wall" part of the velocity so we SLIDE along it,
    // plus a small bounce for hard hits.
    const bounce = intoWall > CRASH_SPEED ? 0.3 : 0;
    this.velocity.addScaledVector(n, intoWall * (1 + bounce));
    // Scraping also costs a little speed.
    this.velocity.multiplyScalar(0.98);

    if (intoWall > CRASH_SPEED && this.crashCooldown <= 0) {
      this.crashCooldown = CRASH_COOLDOWN;
      return true; // CRASH!
    }
    return false;
  }
}
