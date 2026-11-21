// game/eras.js - what's DIFFERENT about London in 1997 vs 2026 (real history):
//   - 2026: the Strand outside KCL is a pedestrian zone (since 2022) -> steel
//           bollards block cars.  1997: it's an open road -> a shortcut!
//   - 1997: no London Eye (it opened in 2000), so it disappears.
// The big one (police can't track you in 1997 - no CCTV, no data) is handled
// in game/timewarp.js.

import * as THREE from 'three';

const BOLLARD_RADIUS = 0.75; // metres, for collisions

export class Eras {
  /**
   * line: { x, z, ax, az, halfWidth } - centre of the bollard line, the direction
   *       ACROSS the road, and how far the line reaches each side.
   * eyeGroup: the London Eye object (hidden in 1997), may be null.
   */
  constructor(scene, line, eyeGroup) {
    this.eye = eyeGroup;
    this.posts = [];
    for (let s = -line.halfWidth; s <= line.halfWidth; s += 1.6) {
      this.posts.push({ x: line.x + line.ax * s, z: line.z + line.az * s });
    }
    // Black posts with a yellow band (like real London security bollards).
    const geo = new THREE.CylinderGeometry(0.22, 0.25, 1.1, 10).translate(0, 0.55, 0);
    const band = new THREE.CylinderGeometry(0.235, 0.235, 0.14, 10).translate(0, 0.85, 0);
    this.mesh = new THREE.Group();
    const postMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5 }), this.posts.length);
    const bandMesh = new THREE.InstancedMesh(band, new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0x553a00 }), this.posts.length);
    const m = new THREE.Matrix4();
    this.posts.forEach((p, i) => { m.makeTranslation(p.x, 0, p.z); postMesh.setMatrixAt(i, m); bandMesh.setMatrixAt(i, m); });
    this.mesh.add(postMesh, bandMesh);
    scene.add(this.mesh);
    this.era = 2026;
  }

  /** Is (x, z) hitting a bollard? (only in 2026) */
  hits(x, z) {
    if (this.era !== 2026) return false;
    return this.posts.some((p) => Math.hypot(x - p.x, z - p.z) < BOLLARD_RADIUS);
  }

  set(era) {
    this.era = era;
    this.mesh.visible = era === 2026; // bollards only exist in 2026
    if (this.eye) this.eye.visible = era === 2026; // no London Eye in 1997
  }
}
