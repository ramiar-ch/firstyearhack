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
  constructor(scene, renderer, blockedAt) {
    this.scene = scene;
    this.renderer = renderer;
    this.blockedAt = blockedAt;
    this.on = false;
    this.car2 = null;
    this.camera2 = new THREE.PerspectiveCamera(58, 1, 0.1, 14000);
    this.cam2 = new DriveCamera(this.camera2);
    this.speedo2 = document.createElement('div');
    this.speedo2.id = 'speedo2';
    document.body.appendChild(this.speedo2);
  }

  /** Turn 2-player mode on/off. car1 = P1's car (P2 appears just behind it). */
  toggle(car1) {
    this.on = !this.on;
    document.body.classList.toggle('split', this.on);
    if (this.on && !this.car2) {
      // Park P2's blue car 9 m behind P1, facing the same way.
      const f = car1.forward();
      this.car2 = new DrivableCar(car1.position.x - f.x * 9, car1.position.z - f.z * 9, car1.heading, this.blockedAt, 0x2a6bff);
      this.scene.add(this.car2.mesh);
      this.cam2.snap(this.car2);
    }
    if (this.car2) this.car2.mesh.visible = this.on;
    return this.on;
  }

  /**
   * One frame for P2. key(code) = is that key held? phoneInput = phone controls or null.
   * Returns true if P2 crashed.
   */
  update(dt, key, phoneInput, car1) {
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
    const crashed = this.car2.update(dt, input);
    this.bumpCars(car1, this.car2);
    this.cam2.update(dt, this.car2);
    this.speedo2.innerHTML = `${Math.round(Math.abs(this.car2.speed) * 2.237)}<small>mph</small>`;
    return crashed;
  }

  /** Cars that overlap push each other apart and swap a bit of speed (a bump). */
  bumpCars(a, b) {
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz);
    const MIN = 2.6; // roughly a car width + a bit
    if (d >= MIN || d < 0.01) return;
    const nx = dx / d, nz = dz / d, push = (MIN - d) / 2;
    a.position.x -= nx * push; a.position.z -= nz * push;
    b.position.x += nx * push; b.position.z += nz * push;
    const va = a.velocity.clone(), vb = b.velocity.clone();
    a.velocity.lerp(vb, 0.5).multiplyScalar(0.8);
    b.velocity.lerp(va, 0.5).multiplyScalar(0.8);
  }

  /** Draw left half with P1's camera, right half with P2's camera. */
  render(camera1, updateWeatherView) {
    const r = this.renderer, w = innerWidth, h = innerHeight, half = Math.floor(w / 2);
    r.setScissorTest(true);
    for (const [cam, x] of [[camera1, 0], [this.camera2, half]]) {
      cam.aspect = half / h;
      cam.updateProjectionMatrix();
      r.setViewport(x, 0, half, h);
      r.setScissor(x, 0, half, h);
      updateWeatherView(cam);
      r.render(this.scene, cam);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, w, h);
  }
}
