// game/scanModel.js - turns a scanned cut-out into a 3D model, and handles
// THROWING it as a GIANT roadblock that stops the police car.
//
// 3D trick (fast, no AI service):
//   - round-ish objects (cans, mugs, bottles): spin the outline around the
//     middle like a pottery wheel (LatheGeometry), photo wrapped around it
//   - flat objects (pens, phones, keys): stack the cut-out in thin layers so it
//     looks like a thick chunky toy

import * as THREE from 'three';

/** Cut-out canvas -> 3D Group about `height` metres tall, standing on y = 0. */
export function buildModel(canvas, height = 1.6) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = canvas.width, h = canvas.height;
  const alpha = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const solid = (x, y) => alpha[(y * w + x) * 4 + 3] > 100;

  // Measure each row: left edge, right edge. Is it mirror-symmetric (round)?
  const rows = [];
  let symmetric = 0, counted = 0;
  for (let y = 0; y < h; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < w; x++) if (solid(x, y)) { if (l < 0) l = x; r = x; }
    rows.push(l < 0 ? 0 : (r - l) / 2);
    if (l >= 0) { counted++; if (Math.abs((l + r) / 2 - w / 2) < w * 0.08) symmetric++; }
  }
  const scale = height / h;
  const group = new THREE.Group();

  if (counted > 0 && symmetric / counted > 0.8 && h > w * 0.7) {
    // ---- Round: lathe (pottery wheel) ----
    const pts = [];
    for (let y = h - 1; y >= 0; y -= Math.max(1, Math.floor(h / 40))) {
      pts.push(new THREE.Vector2(Math.max(0.01, rows[y] * scale), (h - 1 - y) * scale));
    }
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = 2; // photo appears on the front AND back
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 32),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }));
    mesh.rotation.y = Math.PI / 2;
    mesh.castShadow = true;
    group.add(mesh);
  } else {
    // ---- Flat: thick layered cut-out ----
    const geo = new THREE.PlaneGeometry(w * scale, h * scale).translate(0, (h * scale) / 2, 0);
    const front = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ map: tex, color: 0x888888, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    const LAYERS = 9, THICK = Math.min(w, h) * scale * 0.18;
    for (let i = 0; i < LAYERS; i++) {
      const m = new THREE.Mesh(geo, i === 0 || i === LAYERS - 1 ? front : edge);
      m.position.z = (i / (LAYERS - 1) - 0.5) * THICK;
      group.add(m);
    }
  }
  return group;
}

/** Put the 3D model on a car's roof (replaces any old one). */
export function holdModelOnCar(car, canvas) {
  if (car.mesh.userData.held) car.mesh.remove(car.mesh.userData.held);
  const model = buildModel(canvas, 1.5);
  model.position.set(0, 1.55, 0.3);
  car.mesh.add(model);
  car.mesh.userData.held = model;
  car.mesh.userData.heldCanvas = canvas;
}

// ---- Giant roadblocks ---------------------------------------------------------------
export class Roadblocks {
  constructor(scene) {
    this.scene = scene;
    this.list = []; // { group, x, z, radius, age }
  }

  /**
   * Throw the car's held object: a GIANT copy drops behind the car.
   * Returns true if there was something to throw.
   */
  throwFrom(car) {
    const canvas = car.mesh.userData.heldCanvas;
    if (!canvas) return false;
    car.mesh.remove(car.mesh.userData.held);
    car.mesh.userData.held = null;
    car.mesh.userData.heldCanvas = null;

    const HEIGHT = 7; // metres - giant!
    const group = buildModel(canvas, HEIGHT);
    const f = car.forward();
    const x = car.position.x - f.x * 9, z = car.position.z - f.z * 9;
    group.position.set(x, 18, z); // starts in the air and drops
    group.rotation.y = car.heading;
    this.scene.add(group);
    const radius = Math.max(2.5, (HEIGHT * canvas.width / canvas.height) / 2);
    this.list.push({ group, x, z, radius, age: 0, landed: false });
    return true;
  }

  /** Is (x, z) inside any roadblock? (used for collisions) */
  hits(x, z) {
    return this.list.some((r) => r.landed && Math.hypot(x - r.x, z - r.z) < r.radius);
  }

  /** Is a car centre touching a roadblock? */
  touching(pos, extra = 3) {
    return this.list.some((r) => r.landed && Math.hypot(pos.x - r.x, pos.z - r.z) < r.radius + extra);
  }

  /** Animate: drop + bounce, then sink away after 25 s. Returns true on the frame one lands. */
  update(dt) {
    let landedNow = false;
    for (const r of this.list) {
      r.age += dt;
      const g = r.group;
      if (!r.landed) {
        g.position.y = Math.max(0, 18 - 60 * r.age * r.age); // falls faster and faster
        if (g.position.y === 0) { r.landed = true; landedNow = true; r.landTime = r.age; }
      } else {
        const t = r.age - r.landTime;
        g.scale.setScalar(1 + Math.sin(Math.min(t, 0.4) * Math.PI / 0.4) * 0.08 * Math.max(0, 1 - t)); // squash bounce
        if (r.age > 25) g.position.y -= dt * 3; // sink into the ground
      }
    }
    this.list = this.list.filter((r) => {
      if (r.age > 28) { this.scene.remove(r.group); return false; }
      return true;
    });
    return landedNow;
  }
}
