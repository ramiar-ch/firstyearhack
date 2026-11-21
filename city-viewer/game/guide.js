// game/guide.js - full guidance for the mission (so the judge can't get lost):
//   - a big glowing 3D ARROW floating above your car, always pointing at the target
//   - a trail of glowing CHEVRONS on the road towards the target (they slide forward)
//   - the Snowflake Dispatch voice updates every ~12 s ("north-west, 60 metres")
//     and says "nearly there!" when you're close

import * as THREE from 'three';

const COLOURS = { pickup: 0xff8c1a, escape: 0xff2a3a, dropoff: 0x3a8bff };
const CHEVRONS = 8;

export class Guide {
  constructor(scene) {
    // Arrow = a cone + a box, pointing along -z.
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.9, depthTest: false });
    this.arrow = new THREE.Group();
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4).rotateX(-Math.PI / 2), mat);
    head.position.z = -1.6;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 2), mat);
    tail.position.z = 0.5;
    this.arrow.add(head, tail);
    this.arrow.renderOrder = 20; // drawn on top, so it's never hidden
    this.arrow.visible = false;
    scene.add(this.arrow);
    this.mat = mat;

    // Chevrons on the ground: flat ">" shapes.
    const shape = new THREE.Shape([new THREE.Vector2(-1.4, 0.6), new THREE.Vector2(0, -0.8), new THREE.Vector2(1.4, 0.6),
      new THREE.Vector2(1.4, 1.2), new THREE.Vector2(0, -0.2), new THREE.Vector2(-1.4, 1.2)]);
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.chevMat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0.85, depthWrite: false });
    this.chevrons = new THREE.InstancedMesh(geo, this.chevMat, CHEVRONS);
    this.chevrons.frustumCulled = false;
    this.chevrons.visible = false;
    scene.add(this.chevrons);
    this.dummy = new THREE.Object3D();
    this.time = 0;
    this.speakTimer = 0;
    this.saidNear = false;
  }

  /**
   * Every frame. from = the guided player's position (Vector3), target = {x, z} or null,
   * stage = 'pickup' | 'escape' | 'dropoff'. reGuide(text) is called to speak updates.
   */
  update(dt, from, target, stage, reGuide) {
    const show = !!target;
    this.arrow.visible = this.chevrons.visible = show;
    if (!show) { this.saidNear = false; return; }
    this.time += dt;
    const colour = COLOURS[stage] ?? 0xff8c1a;
    this.mat.color.setHex(colour);
    this.chevMat.color.setHex(colour);

    const dx = target.x - from.x, dz = target.z - from.z;
    const dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz); // model points along -z

    // Arrow hovers 7 m above you and bobs.
    this.arrow.position.set(from.x, 7 + Math.sin(this.time * 3) * 0.4, from.z);
    this.arrow.rotation.set(0, yaw, 0);

    // Chevrons every 6 m from 6 m ahead, sliding forward, up to the target.
    const ux = dx / (dist || 1), uz = dz / (dist || 1);
    const slide = (this.time * 6) % 6;
    for (let i = 0; i < CHEVRONS; i++) {
      const d = Math.min(dist - 2, 6 + i * 6 + slide);
      this.dummy.position.set(from.x + ux * d, 0.35, from.z + uz * d);
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.setScalar(d < 2 ? 0.001 : 1);
      this.dummy.updateMatrix();
      this.chevrons.setMatrixAt(i, this.dummy.matrix);
    }
    this.chevrons.instanceMatrix.needsUpdate = true;

    // Voice updates while driving there.
    this.speakTimer += dt;
    if (dist < 35 && !this.saidNear) { this.saidNear = true; reGuide('near'); }
    else if (dist > 45 && this.speakTimer > 12) { this.speakTimer = 0; reGuide('update'); }
  }

  /** New target: reset the voice timers. */
  reset() {
    this.speakTimer = 0;
    this.saidNear = false;
  }
}
