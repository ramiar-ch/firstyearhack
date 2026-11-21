// player.ts - one human player. They are either WALKING (their character) or
// DRIVING a car. Pressing their action key (P1 = E, P2 = Enter) swaps.

import * as THREE from 'three';
import { Character } from './character';
import { Car, NO_INPUT, type DriveInput } from './car';
import { isDown, wasPressed, type KeyMap } from './input';
import { P1_COLOUR, P2_COLOUR, type CharacterConfig } from './characterModel';
import type { CollisionWorld } from '../world/collision';

// Metres from the car's CENTRE. Cars are 6 m long and the person is drawn
// 2x size, so this needs to be fairly generous.
const ENTER_DISTANCE = 9;

export class Player {
  readonly index: 1 | 2;
  readonly name: string;
  readonly colour: number; // ring + HUD colour
  readonly keys: KeyMap;
  readonly character: Character;
  car: Car | null = null; // the car we're driving, or null when on foot
  crashes = 0; // how many times we've crashed (used later for the wanted level)
  controlsEnabled = true; // false during intros/menus

  constructor(index: 1 | 2, keys: KeyMap, config: CharacterConfig) {
    this.index = index;
    this.keys = keys;
    this.name = config.name;
    this.colour = index === 1 ? P1_COLOUR : P2_COLOUR;
    this.character = new Character(keys, config, this.colour);
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
    if (!this.controlsEnabled) return NO_INPUT;
    const k = this.keys;
    return {
      throttle: isDown(k.up) ? 1 : 0,
      brake: isDown(k.down) ? 1 : 0,
      steer: (isDown(k.left) ? 1 : 0) - (isDown(k.right) ? 1 : 0),
      handbrake: isDown(k.handbrake),
    };
  }

  /** Called by the game loop BEFORE the cars update. */
  update(dt: number, cars: Car[], world: CollisionWorld) {
    const model = this.character.model;

    if (this.controlsEnabled && wasPressed(this.keys.action) && !model.hopping) {
      if (this.car) this.exitCar(world);
      else {
        const car = this.nearestCar(cars);
        if (car) this.enterCar(car);
      }
    }

    if (!this.car) {
      // On foot: walk around.
      this.character.update(dt, world, this.controlsEnabled);
    } else if (this.character.mesh.visible) {
      // Just got in: hop towards the car door, then disappear inside.
      // (The game loop already drives the car with our driveInput().)
      this.character.mesh.position.lerp(this.car.position, 1 - Math.exp(-8 * dt));
      model.update(dt, 0);
      if (!model.hopping) this.character.mesh.visible = false;
    }
  }

  /** Controls for a given car this frame: ours if we're driving it. */
  inputFor(car: Car): DriveInput | null {
    return car === this.car ? this.driveInput() : null;
  }

  private enterCar(car: Car) {
    this.car = car;
    car.occupied = true;
    this.character.model.playHop(); // little jump + spin, then we hide
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
