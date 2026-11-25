// game/policeCar.js - a police car that chases you when the police alert is on.
//
// It's a normal DrivableCar (same physics as yours) driven by a tiny "AI":
// follow the road graph around walls, and reverse out if stuck.
// It drives a bit slower than you, so you can get away. Touch = NICKED.
// It gets stopped by giant roadblocks (your thrown scanned object!).

import * as THREE from 'three';
import { DrivableCar } from './car.js';
import { nearestPatrolPoint, route } from './police.js';

const CATCH_DISTANCE = 3.6; // metres between car centres = caught

export class PoliceCar {
  constructor(scene, blockedAt, roads, raycast, makeModel) {
    this.scene = scene;
    this.blockedAt = blockedAt;
    this.roads = roads;
    this.raycast = raycast;
    this.makeModel = makeModel;
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
    const behind = { x: target.position.x - f.x * back - f.z * side, z: target.position.z - f.z * back + f.x * side };
    const spawn = this.roads.length ? nearestPatrolPoint(this.roads, behind) : behind;
    const p = freeSpot(spawn.x, spawn.z);
    if (!this.car) {
      this.car = new DrivableCar(p.x, p.z, target.heading, this.blockedAt, this.makeModel(0xe0e4e6, true));
      this.car.mesh.name = 'Patrol car';
      this.scene.add(this.car.mesh);
    }
    this.car.position.set(p.x, 0, p.z);
    this.car.mesh.rotation.y = target.heading;
    this.car.velocity.set(0, 0, 0);
    this.car.mesh.visible = true;
    this.active = true;
    this.blocked = false;
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.replan = 0;
    this.path = [];
  }

  stop() {
    this.active = false;
    if (this.car) this.car.mesh.visible = false;
  }

  /**
   * One frame of chasing. target = the car to chase.
   * Returns 'caught' when it touches the target, otherwise null.
   */
  update(dt, target, others) {
    if (!this.active) return null;
    // Alternate the two blue clusters on the roof.
    const blink = Math.floor(performance.now() / 180) % 2;
    this.car.mesh.userData.beacons.forEach((mat, i) => { mat.emissiveIntensity = i === blink ? 3.2 : 0.10; });
    if (this.blocked) { this.car.velocity.set(0,0,0); return null; }

    const c = this.car;
    const dx = target.position.x - c.position.x, dz = target.position.z - c.position.z;
    const dist = Math.hypot(dx, dz);
    const contact = target.footprint && CityTraffic.vehicleOverlap(c.footprint(c.position.x,c.position.z,c.heading,0.24),target.footprint());
    if ((dist < CATCH_DISTANCE || contact) && !this.gentle) return 'caught';

    const aim = this.waypoint(dt, c.position, target.position);
    const want = Math.atan2(c.position.x - aim.x, c.position.z - aim.z);
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
    c.update(dt, input, others);
    return null;
  }

  waypoint(dt, from, target) {
    if (!this.roads.length || this.raycast(from.x, from.z, target.x, target.z) === Infinity) {
      this.replan = 0;
      return target;
    }
    this.replan -= dt;
    if (this.replan <= 0) {
      this.path = route(nearestPatrolPoint(this.roads, from), nearestPatrolPoint(this.roads, target));
      this.replan = 0.5;
    }
    while (this.path.length > 1 && Math.hypot(from.x - this.path[0].x, from.z - this.path[0].z) < 3) {
      this.path.shift();
    }
    return this.path[0] ?? target;
  }
}
