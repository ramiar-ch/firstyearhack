// game/policeCar.js - a police car that chases you when the police alert is on.
//
// It's a normal DrivableCar (same physics as yours) driven by a tiny "AI":
// point at the target, full throttle, and reverse out if stuck against a wall.
// It drives a bit slower than you, so you can get away. Touch = NICKED.
// It gets stopped by giant roadblocks (your thrown scanned object!).

import * as THREE from 'three';
import { DrivableCar } from './car.js';

const CATCH_DISTANCE = 3.6; // metres between car centres = caught

export class PoliceCar {
  constructor(scene, blockedAt) {
    this.scene = scene;
    this.blockedAt = blockedAt;
    this.car = null;
    this.active = false;
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.blocked = false; // crashed into a roadblock
    this.gentle = false; // intro mission: chase close behind but never catch
    this.boost = 1; // more wanted stars = faster police
  }

  /** Appear `back` m behind the target car (and `side` m to the side) and start chasing. */
  start(target, freeSpot, back = 45, side = 0) {
    const f = target.forward();
    const p = freeSpot(target.position.x - f.x * back - f.z * side, target.position.z - f.z * back + f.x * side);
    if (!this.car) {
      this.car = new DrivableCar(p.x, p.z, target.heading, this.blockedAt, 0xf2f4f8);
      this.lights = addLightBar(this.car.mesh);
      this.scene.add(this.car.mesh);
    }
    this.car.position.set(p.x, 0, p.z);
    this.car.mesh.rotation.y = target.heading;
    this.car.velocity.set(0, 0, 0);
    this.car.mesh.visible = true;
    this.active = true;
    this.blocked = false;
  }

  stop() {
    this.active = false;
    if (this.car) this.car.mesh.visible = false;
  }

  /**
   * One frame of chasing. target = the car to chase.
   * Returns 'caught' when it touches the target, otherwise null.
   */
  update(dt, target) {
    if (!this.active) return null;
    // Flashing blue/red lights.
    const blink = Math.floor(performance.now() / 180) % 2;
    this.lights[0].material.color.setHex(blink ? 0x1a4dff : 0x111133);
    this.lights[1].material.color.setHex(blink ? 0x330000 : 0xff1a1a);
    if (this.blocked) { this.car.update(dt, { throttle: 0, brake: 1, steer: 0, handbrake: true }); return null; }

    const c = this.car;
    const dx = target.position.x - c.position.x, dz = target.position.z - c.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < CATCH_DISTANCE && !this.gentle) return 'caught';

    // Steer towards the target: compare where we point with where it is.
    const want = Math.atan2(-dx, -dz);
    let diff = want - c.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // -PI..PI
    let input = { throttle: Math.min(1, (Math.abs(diff) > 1.2 ? 0.6 : 0.85) * this.boost), brake: 0, steer: THREE.MathUtils.clamp(diff * 2.5, -1, 1), handbrake: false };

    // Stuck against a wall? Reverse for a second with the wheel turned the other way.
    const holding = this.gentle && dist < 12; // waiting behind you on purpose (intro mission)
    if (Math.abs(c.speed) < 1 && !holding) this.stuckTime += dt; else this.stuckTime = 0;
    if (this.stuckTime > 1.2) { this.reverseTime = 1; this.stuckTime = 0; }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      input = { throttle: 0, brake: 1, steer: -input.steer, handbrake: false };
    }
    // Gentle mode: hang back ~12 m behind you (scary, but can't catch you).
    if (holding) input = { throttle: 0, brake: c.speed > 0.5 ? 0.6 : 0, steer: input.steer, handbrake: false };
    c.update(dt, input);
    return null;
  }
}

/** Blue and red light boxes on the roof + POLICE-ish blue stripe. */
function addLightBar(mesh) {
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0x1a4dff }));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), new THREE.MeshBasicMaterial({ color: 0xff1a1a }));
  blue.position.set(-0.35, 1.6, 0.3);
  red.position.set(0.35, 1.6, 0.3);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.16, 4.3), new THREE.MeshStandardMaterial({ color: 0x1a3fbf }));
  stripe.position.y = 0.7;
  mesh.add(blue, red, stripe);
  return [blue, red];
}
