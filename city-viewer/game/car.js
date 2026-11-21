// game/car.js - a drivable car for the city viewer.
//
// Arcade driving, no physics engine. The car has a position, a heading
// (which way it points) and a velocity (which way it's actually moving):
//   - throttle / brake / drag change the forward speed
//   - tyre grip kills sideways sliding (less grip on the handbrake = drift)
//   - steering only works while moving
// Collisions use the viewer's own blockedAt(x, z) test (buildings, the
// Thames, edge of the map): if the car would end up inside something we
// slide along it, or stop and bounce back if it's a head-on hit.
//
// Coordinates are the viewer's: x = east, z = south, y = up, in metres.
// Forward = -z in the car's own model (same as the camera's convention).

import * as THREE from 'three';

// ---- Tuning knobs (play with these!) ---------------------------------------
const ACCELERATION = 9; // m/s per second with full throttle
const BRAKE = 18;
const REVERSE_ACCEL = 5;
const MAX_SPEED = 24; // m/s (~54 mph)
const MAX_REVERSE = 7;
const DRAG = 0.5; // air drag (bigger at high speed)
const ROLLING = 2; // m/s per second lost when coasting
const TURN_RATE = 1.9; // radians per second at full lock
const GRIP = 9; // how fast sideways sliding stops
const DRIFT_GRIP = 1.6; // ...while handbraking (low = long slides)
const HANDBRAKE_TURN = 0.7; // extra turning on the handbrake

// Real car size (metres): the viewer is life-size.
const LENGTH = 4.4;
const WIDTH = 1.9;

export class DrivableCar {
  /**
   * x, z: where to park it. heading: radians (0 = pointing north / -z).
   * blockedAt(x, z): returns true if that ground point is a wall/water.
   */
  constructor(x, z, heading, blockedAt, colour = 0xff7a1a) {
    this.blockedAt = blockedAt;
    this.velocity = new THREE.Vector3();
    this.mesh = buildCarMesh(colour);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.braking = false;
    this.wheelSpin = 0;
  }

  get position() { return this.mesh.position; }
  get heading() { return this.mesh.rotation.y; }

  /** Unit vector the car points along. */
  forward() {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  /** Speed along the direction the car points (negative = reversing). */
  get speed() {
    return this.velocity.dot(this.forward());
  }

  /**
   * One frame of driving.
   * input = { throttle: 0..1, brake: 0..1, steer: -1 (right) .. 1 (left), handbrake: bool }
   * Returns true if we crashed into something hard this frame.
   */
  update(dt, input) {
    const fwd = this.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let speed = this.velocity.dot(fwd); // forward part of the velocity
    let slide = this.velocity.dot(right); // sideways part

    // ---- Speed: throttle, brake/reverse, handbrake, drag ----
    speed += ACCELERATION * input.throttle * dt;
    if (input.brake > 0) speed -= (speed > 0.5 ? BRAKE : REVERSE_ACCEL) * input.brake * dt;
    if (input.handbrake) speed -= speed * 0.8 * dt;
    speed -= speed * DRAG * dt * (Math.abs(speed) / MAX_SPEED);
    if (!input.throttle && !input.brake) {
      const slow = ROLLING * dt;
      speed = Math.abs(speed) < slow ? 0 : speed - Math.sign(speed) * slow;
    }
    speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, speed));

    // ---- Grip: shrink the sideways slide (much less on the handbrake) ----
    slide *= Math.exp(-(input.handbrake ? DRIFT_GRIP : GRIP) * dt);

    // ---- Steering: only when moving; flips when reversing (like a real car) ----
    const speedFactor = Math.max(-1, Math.min(1, speed / 6));
    const turn = TURN_RATE + (input.handbrake ? HANDBRAKE_TURN : 0);
    const headingBefore = this.heading;
    this.mesh.rotation.y += input.steer * turn * speedFactor * dt;

    // Rebuild the velocity with the OLD direction vectors: after turning, the
    // old "forward" is partly sideways - that's what makes the back slide out.
    this.velocity.copy(fwd).multiplyScalar(speed).addScaledVector(right, slide);

    // ---- Move + collide ----
    const crashed = this.moveWithCollisions(dt, headingBefore);

    // ---- Looks: spin the wheels, glow the brake lights ----
    this.wheelSpin += (this.speed * dt) / 0.33; // wheel radius 0.33 m
    for (const w of this.mesh.userData.wheels) w.rotation.x = -this.wheelSpin;
    this.braking = input.brake > 0 && this.speed > 0.5;
    this.mesh.userData.tailMat.emissiveIntensity = this.braking || input.handbrake ? 4 : 1.2;
    return crashed;
  }

  /** Is any part of the car's outline on a wall/water? */
  hits(x, z, heading) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading); // forward
    const rx = -fz, rz = fx; // right
    const hl = LENGTH / 2 - 0.15, hw = WIDTH / 2 - 0.1;
    // Test the 4 corners plus the middle of the front and back bumpers.
    for (const [f, r] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]]) {
      if (this.blockedAt(x + fx * f + rx * r, z + fz * f + rz * r)) return true;
    }
    return false;
  }

  moveWithCollisions(dt, headingBefore) {
    const p = this.position;
    const dx = this.velocity.x * dt, dz = this.velocity.z * dt;
    const h = this.heading;
    if (!this.hits(p.x + dx, p.z + dz, h)) { p.x += dx; p.z += dz; return false; }

    // Blocked: try sliding along the wall in just x or just z.
    const impact = this.velocity.length();
    if (!this.hits(p.x + dx, p.z, h)) {
      const crashed = Math.abs(this.velocity.z) > 5;
      p.x += dx;
      this.velocity.z *= -0.2;
      this.velocity.multiplyScalar(0.97);
      return crashed;
    }
    if (!this.hits(p.x, p.z + dz, h)) {
      const crashed = Math.abs(this.velocity.x) > 5;
      p.z += dz;
      this.velocity.x *= -0.2;
      this.velocity.multiplyScalar(0.97);
      return crashed;
    }

    // Head-on: stop and bounce back a little.
    this.velocity.multiplyScalar(-0.25);
    // If turning pushed a corner INTO the wall, undo the turn too.
    if (this.hits(p.x, p.z, h)) this.mesh.rotation.y = headingBefore;
    return impact > 5; // a proper crash, not a gentle nudge
  }
}

// ---- The car's 3D model: boxes + cylinders (original design) ---------------
export function buildCarMesh(colour) {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.1, metalness: 0.8 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.25, metalness: 0.9 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    car.add(m);
    return m;
  };

  // Body, a slightly narrower cabin with glass, and a roof.
  add(new THREE.BoxGeometry(WIDTH, 0.62, LENGTH), paint, 0, 0.62, 0);
  add(new THREE.BoxGeometry(WIDTH - 0.16, 0.5, 2.3), glass, 0, 1.18, 0.25);
  add(new THREE.BoxGeometry(WIDTH - 0.2, 0.08, 2.1), paint, 0, 1.47, 0.3);
  // Bumpers.
  add(new THREE.BoxGeometry(WIDTH + 0.04, 0.22, 0.18), dark, 0, 0.42, -LENGTH / 2);
  add(new THREE.BoxGeometry(WIDTH + 0.04, 0.22, 0.18), dark, 0, 0.42, LENGTH / 2);

  // Wheels (cylinders turned on their side) - they spin while driving.
  const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 14).rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 10).rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.88, -1.35], [0.88, -1.35], [-0.88, 1.35], [0.88, 1.35]]) {
    const w = new THREE.Group();
    w.position.set(x, 0.33, z);
    w.add(new THREE.Mesh(wheelGeo, dark), new THREE.Mesh(hubGeo, chrome));
    car.add(w);
    wheels.push(w);
  }

  // Lights. Emissive = they glow (and bloom at night).
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xfff1c4, emissiveIntensity: 2.5 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a0a, emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.42, 0.16, 0.06), headMat, side * 0.62, 0.74, -LENGTH / 2 - 0.01);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), tailMat, side * 0.62, 0.76, LENGTH / 2 + 0.01);
  }

  car.userData.wheels = wheels;
  car.userData.tailMat = tailMat;
  return car;
}
