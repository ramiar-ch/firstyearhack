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
export function cameraPoseFor(car, view = 'chase', look) {
  const v = VIEWS[view];
  const fwd = car.forward();
  // Look a little further ahead (and back off a bit) when going fast.
  const fast = Math.min(1, Math.abs(car.speed) / 24);
  const back = Math.max(v.back, car.spec?.cam?.[0] || 0) + fast * 4;
  const up = Math.max(v.up, car.spec?.cam?.[1] || 0) + fast * 1.5;
  const heading = car.heading + (look?.yaw ?? 0);
  const orbit = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const elevation = Math.atan2(up, back) + (look?.pitch ?? 0);
  const radius = Math.hypot(back, up);
  const position = car.position.clone()
    .addScaledVector(orbit, -radius * Math.cos(elevation))
    .add(new THREE.Vector3(0, Math.max(1.55, radius * Math.sin(elevation)), 0));
  const lead = (v.ahead + fast * 6) * Math.max(0.15, Math.cos(look?.yaw ?? 0));
  const lookAt = car.position.clone().addScaledVector(fwd, lead).add(new THREE.Vector3(0, 1.2, 0));
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

  update(dt, car, look, raycast) {
    const pose = cameraPoseFor(car, this.view, look);
    const t = 1 - Math.exp(-5 * dt); // smooth follow, same at any frame rate
    this.camera.position.lerp(pose.position, t);
    if (raycast && this.view === 'chase') {
      const offset = this.camera.position.clone().sub(car.position);
      const distance = Math.hypot(offset.x, offset.z);
      const hit = raycast(car.position.x, car.position.z, this.camera.position.x, this.camera.position.z);
      if (hit < distance) {
        const fraction = Math.max(0, hit - 0.35) / distance;
        this.camera.position.x = car.position.x + offset.x * fraction;
        this.camera.position.z = car.position.z + offset.z * fraction;
      }
    }
    this.lookAt.lerp(pose.lookAt, 1 - Math.exp(-8 * dt));
    if (this.camera.position.y < 1.5) this.camera.position.y = 1.5; // never under the road
    this.camera.lookAt(this.lookAt);
  }
}
