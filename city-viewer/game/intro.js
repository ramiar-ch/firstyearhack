// game/intro.js - the opening camera swoop.
//
// Starts very high above central London (the whole map + the Thames in view),
// then in 3 seconds swoops down and turns towards the car parked in front of
// the KCL Strand Building, ending exactly where the driving camera sits.
// Any key or click skips it.
//
// How the movement works: we describe the camera as "distance + angle" around
// the point it looks at (like a drone on a stick). Over the 3 seconds we blend
//   - the look-at point: map centre -> the car
//   - the distance:      2200 m     -> ~12 m   (blended on a log scale, so the
//                                                zoom feels even all the way)
//   - the angle:         straight down -> behind the car
// using an ease-in-out curve, so it starts and ends gently (no sudden jumps).

import * as THREE from 'three';

const HOLD = 0.6; // seconds looking at the whole map first (the loading screen fades)
const DURATION = 3; // seconds of swooping

/** Smooth start and smooth stop: 0 -> 1. */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class IntroSwoop {
  /**
   * camera: the THREE camera to move.
   * endPose: { position, lookAt } where the swoop must finish.
   * onDone: called once when it finishes (or is skipped).
   */
  constructor(camera, endPose, onDone) {
    this.camera = camera;
    this.onDone = onDone;
    this.time = 0;
    this.done = false;

    // End: distance/angles of the final camera around its look-at point.
    const offset = endPose.position.clone().sub(endPose.lookAt);
    this.end = {
      target: endPose.lookAt.clone(),
      dist: offset.length(),
      pitch: Math.asin(offset.y / offset.length()), // angle above the horizon
      yaw: Math.atan2(offset.x, offset.z), // compass direction of the camera
    };
    // Start: high above the middle of the map, looking (almost) straight down,
    // turned a bit so the camera rotates on the way down.
    this.start = {
      target: new THREE.Vector3(0, 0, 150), // a little south: KCL + the Thames
      dist: 2200,
      pitch: THREE.MathUtils.degToRad(88),
      yaw: this.end.yaw - 0.9,
    };

    // Caption that fades in and out half way down.
    this.caption = document.createElement('div');
    this.caption.className = 'intro-caption';
    this.caption.textContent = 'KCL STRAND · LONDON';
    document.body.appendChild(this.caption);

    // Any key or click skips (we listen once, then remove the listeners).
    this.skip = this.skip.bind(this);
    addEventListener('keydown', this.skip);
    addEventListener('pointerdown', this.skip);

    this.apply(0);
  }

  /** Put the camera at progress e (0 = start, 1 = end). */
  apply(e) {
    const s = this.start, f = this.end;
    const target = s.target.clone().lerp(f.target, e);
    const dist = Math.exp(THREE.MathUtils.lerp(Math.log(s.dist), Math.log(f.dist), e));
    const pitch = THREE.MathUtils.lerp(s.pitch, f.pitch, e);
    const yaw = THREE.MathUtils.lerp(s.yaw, f.yaw, e);
    this.camera.position.set(
      target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(target);
  }

  /** Call every frame. Returns true while the intro is still playing. */
  update(dt) {
    if (this.done) return false;
    this.time += dt;
    const t = Math.min(1, Math.max(0, (this.time - HOLD) / DURATION));
    this.apply(easeInOut(t));

    // Caption: fade in from 35% to 50%, out from 75% to 95%.
    const fadeIn = THREE.MathUtils.smoothstep(t, 0.35, 0.5);
    const fadeOut = 1 - THREE.MathUtils.smoothstep(t, 0.75, 0.95);
    this.caption.style.opacity = String(Math.min(fadeIn, fadeOut));

    if (t >= 1) this.finish();
    return !this.done;
  }

  skip(e) {
    // Don't let the skipping key also do something else (like E = get out).
    if (e && e.type === 'keydown') e.stopImmediatePropagation();
    this.apply(1);
    this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    removeEventListener('keydown', this.skip);
    removeEventListener('pointerdown', this.skip);
    this.caption.remove();
    this.onDone();
  }
}
