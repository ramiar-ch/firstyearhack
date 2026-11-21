// overheadCamera.ts - the high, angled 1997-style camera.
// It sits above and slightly south of the target, looking down at ~60 degrees,
// and pulls further away the faster the target moves.

import * as THREE from 'three';

// Angle down from horizontal. The brief said ~60, but London streets are
// narrow and tall, so at 60 the building south of you hides the player.
// 75 is steep enough to see into streets while still showing building sides.
const PITCH = THREE.MathUtils.degToRad(75);
// Must be well above the rooftops! Central London buildings are 30-60 m tall,
// so at 60 degrees a distance of 110 m puts the camera ~95 m up.
const BASE_DISTANCE = 110; // metres from the target when standing still
const ZOOM_PER_SPEED = 3; // extra metres per (m/s) of speed
const MAX_DISTANCE = 240;
const CAR_EXTRA = 35; // extra metres of zoom-out while in a car
const SMOOTHING = 4; // higher = camera catches up faster

export class OverheadCamera {
  readonly camera: THREE.PerspectiveCamera;
  private distance = BASE_DISTANCE;

  constructor(aspect: number) {
    // Narrow-ish field of view = flatter, more "top-down map" look.
    this.camera = new THREE.PerspectiveCamera(40, aspect, 1, 3000);
  }

  // Jump straight to the target (used at spawn so we don't swoop in).
  snapTo(target: THREE.Vector3) {
    this.camera.position.copy(this.desiredPosition(target));
    this.camera.lookAt(target);
  }

  /** extra = more metres of zoom-out (e.g. to keep two players on screen). */
  update(dt: number, target: THREE.Vector3, speed: number, inCar = false, extra = 0) {
    // Smoothly change the zoom distance towards the one for our speed.
    const base = BASE_DISTANCE + (inCar ? CAR_EXTRA : 0) + extra;
    const wanted = Math.min(MAX_DISTANCE + extra, base + speed * ZOOM_PER_SPEED);
    const t = 1 - Math.exp(-SMOOTHING * dt); // frame-rate independent lerp
    this.distance += (wanted - this.distance) * t;

    this.camera.position.lerp(this.desiredPosition(target), t);
    this.camera.lookAt(target);
  }

  private desiredPosition(target: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(
      target.x,
      target.y + Math.sin(PITCH) * this.distance, // up
      target.z + Math.cos(PITCH) * this.distance, // south of the target
    );
  }
}
