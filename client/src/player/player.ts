// player.ts - one human player. They are either WALKING (the capsule) or
// DRIVING a car. Pressing the action key (E) swaps between the two.

import * as THREE from 'three';
import { Character } from './character';
import { Car, NO_INPUT, type DriveInput } from './car';
import { isDown, wasPressed, type KeyMap } from './input';
import type { CollisionWorld } from '../world/collision';

const ENTER_DISTANCE = 6; // metres - how close you must be to get in a car

export class Player {
  readonly character: Character;
  car: Car | null = null; // the car we're driving, or null when on foot
  private keys: KeyMap;

  constructor(keys: KeyMap, color?: number) {
    this.keys = keys;
    this.character = new Character(keys, color);
  }

  /** Where the camera should look. */
  get position(): THREE.Vector3 {
    return this.car ? this.car.position : this.character.mesh.position;
  }

  /** How fast we're going (the camera zooms out with speed). */
  get speed(): number {
    return this.car ? Math.abs(this.car.speed) : this.character.velocity.length();
  }

  /** The closest empty car we could get into right now (or null). */
  nearestCar(cars: Car[]): Car | null {
    let best: Car | null = null;
    let bestD = ENTER_DISTANCE;
    for (const car of cars) {
      if (car.occupied) continue;
      const d = car.position.distanceTo(this.character.mesh.position);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Turn the held keys into driving controls. */
  driveInput(): DriveInput {
    const k = this.keys;
    return {
      throttle: isDown(k.up) ? 1 : 0,
      brake: isDown(k.down) ? 1 : 0,
      steer: (isDown(k.left) ? 1 : 0) - (isDown(k.right) ? 1 : 0),
      handbrake: isDown(k.run),
    };
  }

  /** Called by the game loop BEFORE the cars update. */
  update(dt: number, cars: Car[], world: CollisionWorld) {
    if (wasPressed(this.keys.action)) {
      if (this.car) this.exitCar(world);
      else {
        const car = this.nearestCar(cars);
        if (car) this.enterCar(car);
      }
    }

    // On foot we move the character; in a car the game loop drives the car
    // with our driveInput() (see main.ts), so empty cars can still roll.
    if (!this.car) this.character.update(dt, world);
  }

  /** Controls for a given car this frame: ours if we're driving it. */
  inputFor(car: Car): DriveInput {
    return car === this.car ? this.driveInput() : NO_INPUT;
  }

  private enterCar(car: Car) {
    this.car = car;
    car.occupied = true;
    this.character.mesh.visible = false; // we're "inside" the car
  }

  private exitCar(world: CollisionWorld) {
    const car = this.car!;
    // Step out of the driver's side (in the UK that's the RIGHT side).
    // If that's inside a wall, try the left side, then the back.
    const fwd = car.forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const options = [right.clone().multiplyScalar(3), right.clone().multiplyScalar(-3), fwd.clone().multiplyScalar(-5)];
    const spot = options
      .map((o) => car.position.clone().add(o))
      .find((p) => !world.isBlocked(p.x, p.z, 0.8)) ?? car.position.clone();

    this.character.mesh.position.copy(spot);
    this.character.mesh.rotation.y = car.heading;
    this.character.mesh.visible = true;
    car.occupied = false;
    this.car = null;
  }
}
