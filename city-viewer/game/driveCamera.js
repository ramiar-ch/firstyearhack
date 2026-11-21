// game/driveCamera.js - where the camera sits while driving.
//
// Two views (press V to switch):
//   'chase'    - behind and above the car, looking where it's going
//   'overhead' - high top-down view, like the 1997-era games
// The camera eases towards its target position every frame, so it feels smooth.

import * as THREE from 'three';

const VIEWS = {
  chase: { back: 11, up: 4.5, ahead: 6 }, // metres behind / above / look-ahead
  overhead: { back: 18, up: 70, ahead: 4 },
};

/** The ideal camera position + look-at point for this car right now. */
export function cameraPoseFor(car, view = 'chase') {
  const v = VIEWS[view];
  const fwd = car.forward();
  // Look a little further ahead (and back off a bit) when going fast.
  const fast = Math.min(1, Math.abs(car.speed) / 24);
  const position = car.position.clone()
    .addScaledVector(fwd, -(v.back + fast * 4))
    .add(new THREE.Vector3(0, v.up + fast * 1.5, 0));
  const lookAt = car.position.clone().addScaledVector(fwd, v.ahead + fast * 6).add(new THREE.Vector3(0, 1.2, 0));
  return { position, lookAt };
}

export class DriveCamera {
  constructor(camera) {
    this.camera = camera;
    this.view = 'chase';
    this.lookAt = new THREE.Vector3();
  }

  toggleView() {
    this.view = this.view === 'chase' ? 'overhead' : 'chase';
    return this.view;
  }

  /** Jump straight to the right spot (no easing). */
  snap(car) {
    const pose = cameraPoseFor(car, this.view);
    this.camera.position.copy(pose.position);
    this.lookAt.copy(pose.lookAt);
    this.camera.lookAt(this.lookAt);
  }

  update(dt, car) {
    const pose = cameraPoseFor(car, this.view);
    const t = 1 - Math.exp(-5 * dt); // smooth follow, same at any frame rate
    this.camera.position.lerp(pose.position, t);
    this.lookAt.lerp(pose.lookAt, 1 - Math.exp(-8 * dt));
    if (this.camera.position.y < 1.5) this.camera.position.y = 1.5; // never under the road
    this.camera.lookAt(this.lookAt);
  }
}
