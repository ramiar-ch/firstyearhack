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
const LENGTH = 4.55;
const WIDTH = 2.25;

export class DrivableCar {
  /**
   * x, z: where to park it. heading: radians (0 = pointing north / -z).
   * blockedAt(x, z): returns true if that ground point is a wall/water.
   */
  constructor(x, z, heading, blockedAt, model) {
    this.blockedAt = blockedAt;
    this.velocity = new THREE.Vector3();
    this.mesh = model;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.braking = false;
    this.travel = 0;
  }

  get position() { return this.mesh.position; }
  get heading() { return this.mesh.rotation.y; }
  get kind() { return this.mesh.userData.kind || 'car'; }
  get spec() { return this.mesh.userData.spec || {}; }
  get length() { return this.spec.length || LENGTH; }
  get width() { return this.spec.width || WIDTH; }

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
  update(dt, input, others = []) {
    const fwd = this.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let speed = this.velocity.dot(fwd); // forward part of the velocity
    let slide = this.velocity.dot(right); // sideways part

    // ---- Speed: throttle, brake/reverse, handbrake, drag ----
    speed += (this.spec.acc || ACCELERATION) * input.throttle * dt;
    if (input.brake > 0) speed -= (speed > 0.5 ? BRAKE : REVERSE_ACCEL) * input.brake * dt;
    if (input.handbrake) speed -= speed * 0.8 * dt;
    speed -= speed * DRAG * dt * (Math.abs(speed) / MAX_SPEED);
    if (!input.throttle && !input.brake) {
      const slow = ROLLING * dt;
      speed = Math.abs(speed) < slow ? 0 : speed - Math.sign(speed) * slow;
    }
    speed = Math.max(-(this.spec.rev || MAX_REVERSE), Math.min(this.spec.max || MAX_SPEED, speed));

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
    const beforeX = this.position.x, beforeZ = this.position.z;
    const crashed = this.moveWithCollisions(dt, headingBefore, others);

    // ---- Looks: spin the wheels, glow the brake lights ----
    this.travel += (this.position.x-beforeX)*fwd.x + (this.position.z-beforeZ)*fwd.z;
    this.mesh.userData.animate(this.travel, input.steer * 0.38);
    this.braking = input.brake > 0 && this.speed > 0.5;
    if (this.mesh.userData.tailMat) this.mesh.userData.tailMat.emissiveIntensity = this.braking || input.handbrake ? 4 : 1.2;
    return crashed;
  }

  /** Is any part of the car's outline on a wall/water? */
  hits(x, z, heading) {
    const fx = -Math.sin(heading), fz = -Math.cos(heading); // forward
    const rx = -fz, rz = fx; // right
    if (this.blockedBox?.(this.footprint(x,z,heading))) return true;
    const hl = this.length / 2 - 0.15, hw = this.width / 2 - 0.1;
    // Test the 4 corners plus the middle of the front and back bumpers.
    for (const [f, r] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]]) {
      if (this.blockedAt(x + fx * f + rx * r, z + fz * f + rz * r)) return true;
    }
    return false;
  }

  footprint(x=this.position.x, z=this.position.z, yaw=this.heading, padding=0) {
    return CityTraffic.footprint(x, z, yaw, this.width + padding, this.length + padding);
  }

  moveWithCollisions(dt, headingBefore, others) {
    const p = this.position;
    const dx = this.velocity.x * dt, dz = this.velocity.z * dt;
    const blocked = ({x,z,yaw}) => this.hits(x,z,yaw) || others.some(other =>
      CityTraffic.vehicleOverlap(this.footprint(x,z,yaw),other.footprint()));
    const start = {x:p.x,z:p.z,yaw:headingBefore};
    const radius = Math.hypot(this.length,this.width)/2;
    const result = CityTraffic.sweep(start, dx, dz, this.heading-headingBefore, radius, blocked);
    this.mesh.rotation.y = result.pose.yaw;
    p.x = result.pose.x;
    p.z = result.pose.z;
    if (!result.hit) return false;

    const impact = this.velocity.length();
    const restX = dx-(p.x-start.x), restZ = dz-(p.z-start.z);
    for (const [x,z] of [[restX,0],[0,restZ]]) {
      if (Math.abs(x)+Math.abs(z)<0.001) continue;
      const slide = CityTraffic.sweep(result.pose,x,z,0,radius,blocked);
      if (slide.hit) continue;
      p.x = slide.pose.x;
      p.z = slide.pose.z;
      if (x) this.velocity.z *= -0.2;
      else this.velocity.x *= -0.2;
      this.velocity.multiplyScalar(0.97);
      return impact > 5;
    }

    // Head-on: stop and bounce back a little.
    this.velocity.multiplyScalar(-0.25);
    return impact > 5; // a proper crash, not a gentle nudge
  }
}
