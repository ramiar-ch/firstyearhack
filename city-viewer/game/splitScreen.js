// game/splitScreen.js - 2 players on one screen (left = P1, right = P2).
//
// P2 gets their own blue car and their own camera. Each frame we draw the
// city TWICE: once into the left half (P1's camera) and once into the right
// half (P2's camera), using renderer.setViewport + setScissor.
// P2 drives with the arrow keys (Right Ctrl = handbrake) or the phone controller.

import * as THREE from 'three';
import { DrivableCar } from './car.js';
import { DriveCamera } from './driveCamera.js';

export class SplitScreen {
  constructor(scene, renderer, blockedAt, makeModel, blockedBox = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.blockedAt = blockedAt;
    this.makeModel = makeModel;
    this.blockedBox = blockedBox;
    this.on = false;
    this.car2 = null;
    this.camera2 = new THREE.PerspectiveCamera(58, 1, 0.1, 14000);
    this.cam2 = new DriveCamera(this.camera2);
    this.speedo2 = document.createElement('div');
    this.speedo2.id = 'speedo2';
    document.body.appendChild(this.speedo2);
  }

  /** Enable a second car at a clear spot beside or behind the first. */
  setEnabled(enabled, car1) {
    if (enabled === this.on) return this.on;
    if (enabled) {
      if (!this.car2) {
        this.car2 = new DrivableCar(0, 0, car1.heading, this.blockedAt, this.makeModel(0x3667a6));
        this.car2.blockedBox = this.blockedBox;
        this.car2.mesh.name = 'P2 car';
        this.car2.mesh.visible = false;
        this.scene.add(this.car2.mesh);
      }
      const f = car1.forward(), origin = car1.position;
      let spawn;
      for (const [along, side] of [[-8,0],[-8,3],[-8,-3],[7,0],[6,3],[6,-3],[-12,0],[0,3.1],[0,-3.1]]) {
        const x = origin.x + f.x*along - f.z*side, z = origin.z + f.z*along + f.x*side;
        if (this.car2.hits(x,z,car1.heading) || CityTraffic.vehicleOverlap(this.car2.footprint(x,z,car1.heading),car1.footprint())) continue;
        spawn = {x,z};
        break;
      }
      if (!spawn) return false;
      this.car2.position.set(spawn.x,0,spawn.z);
      this.car2.mesh.rotation.y = car1.heading;
      this.car2.velocity.set(0,0,0);
      this.cam2.snap(this.car2);
    }
    this.on = enabled;
    document.body.classList.toggle('split', this.on);
    if (this.car2) this.car2.mesh.visible = this.on;
    return this.on;
  }

  /**
   * One frame for P2. key(code) = is that key held? phoneInput = phone controls or null.
   * Returns true if P2 crashed.
   */
  update(dt, key, phoneInput, car1, patrols) {
    if (!this.on) return false;
    const input = {
      throttle: key('ArrowUp') ? 1 : 0,
      brake: key('ArrowDown') ? 1 : 0,
      steer: (key('ArrowLeft') ? 1 : 0) - (key('ArrowRight') ? 1 : 0),
      handbrake: key('ControlRight'),
    };
    if (phoneInput) {
      input.throttle = Math.max(input.throttle, phoneInput.throttle);
      input.brake = Math.max(input.brake, phoneInput.brake);
      if (!input.steer) input.steer = phoneInput.steer;
      input.handbrake = input.handbrake || phoneInput.handbrake;
    }
    const crashed = this.car2.update(dt, input, [car1, ...patrols]);
    this.cam2.update(dt, this.car2);
    this.speedo2.innerHTML = `${Math.round(Math.abs(this.car2.speed) * 2.237)}<small>mph</small>`;
    return crashed;
  }

  /** Draw left half with P1's camera, right half with P2's camera. */
  render(camera1, updateWeatherView) {
    const r = this.renderer, w = innerWidth, h = innerHeight, half = Math.floor(w / 2);
    r.setScissorTest(true);
    for (const [cam, x, width] of [[camera1, 0, half], [this.camera2, half, w-half]]) {
      cam.aspect = width / h;
      cam.updateProjectionMatrix();
      r.setViewport(x, 0, width, h);
      r.setScissor(x, 0, width, h);
      updateWeatherView(cam);
      r.render(this.scene, cam);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }
}
