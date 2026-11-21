// game/pigeonMan.js - 1997 has no GPS, so you follow PIGEON MAN instead.
//
// A London character (flat cap, long coat, pigeons flapping round his head)
// who appears only in 1997 mode. He sprints ~18 m ahead of you towards the
// current mission target (super fast, so even a car can follow him), waits and
// waves if you fall behind, and stands on the target when you're close.
// A "FOLLOW ME!" sign floats above him so he's easy to spot from above.

import * as THREE from 'three';

const LEAD = 18; // metres ahead of the player
const SCALE = 3.4; // drawn MUCH bigger than life so he's readable from the overhead camera

export class PigeonMan {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(SCALE);
    this.root.visible = false;
    scene.add(this.root);
    this.build();
    this.time = 0;
    this.shown = false;
  }

  build() {
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    const box = (w, h, d, c, x, y, z, parent = this.root) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // Legs (they swing when he runs)
    this.legs = [-0.12, 0.12].map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0.85, 0);
      box(0.16, 0.8, 0.18, 0x2b2b2b, 0, -0.4, 0, g);
      box(0.18, 0.1, 0.28, 0x111111, 0, -0.82, -0.04, g);
      this.root.add(g);
      return g;
    });
    box(0.5, 0.75, 0.3, 0x6b4e2e, 0, 1.2, 0); // long brown coat
    box(0.3, 0.3, 0.28, 0xe0b48c, 0, 1.75, 0); // head
    box(0.36, 0.08, 0.36, 0x3d3d3d, 0, 1.93, 0); // flat cap
    box(0.3, 0.04, 0.16, 0x3d3d3d, 0, 1.9, -0.2); // cap brim
    box(0.36, 0.08, 0.3, 0x8b1d1d, 0, 1.55, 0); // red scarf
    // Arms (one waves when he's waiting for you)
    this.arms = [-0.33, 0.33].map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 1.5, 0);
      box(0.13, 0.55, 0.14, 0x6b4e2e, 0, -0.27, 0, g);
      this.root.add(g);
      return g;
    });

    // Pigeons circling his head: grey body, darker wings that flap.
    this.pigeons = [];
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Group();
      box(0.18, 0.12, 0.3, 0x8a8f99, 0, 0, 0, p); // body
      box(0.1, 0.1, 0.1, 0x5f7a6a, 0, 0.06, -0.17, p); // green-grey neck
      const wl = box(0.25, 0.03, 0.16, 0x6b707a, -0.17, 0.03, 0, p);
      const wr = box(0.25, 0.03, 0.16, 0x6b707a, 0.17, 0.03, 0, p);
      p.userData = { wl, wr, phase: (i / 4) * Math.PI * 2 };
      this.root.add(p);
      this.pigeons.push(p);
    }

    // "FOLLOW ME!" sign (a sprite = always faces the camera).
    const c = document.createElement('canvas');
    c.width = 256; c.height = 72;
    const g = c.getContext('2d');
    g.fillStyle = '#a8c66c'; g.fillRect(0, 0, 256, 72);
    g.strokeStyle = '#1c2b10'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 66);
    g.fillStyle = '#1c2b10'; g.font = 'bold 30px "Courier New", monospace'; g.textAlign = 'center';
    g.fillText('FOLLOW ME!', 128, 47);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sign.scale.set(2.4, 0.68, 1);
    sign.position.y = 3;
    sign.renderOrder = 20;
    this.root.add(sign);
  }

  /**
   * Every frame. player = Vector3, target = {x, z} or null, active = in 1997 with a mission.
   * Returns true the first frame he appears (so the game can show a message).
   */
  update(dt, player, target, active, roadPoint = null) {
    this.time += dt;
    const show = active && !!target;
    const appeared = show && !this.shown;
    if (appeared) this.root.position.set(player.x, 0, player.z); // pops out next to you
    this.shown = show;
    this.root.visible = show;
    if (!show) return false;

    // Where he wants to be: LEAD m ahead of you, on the way to the target.
    const dx = target.x - player.x, dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    const lead = Math.min(LEAD, dist);
    // Follow the ROAD route if we have one (never through buildings), else a straight line.
    const goal = roadPoint
      ? new THREE.Vector3(roadPoint.x, 0, roadPoint.z)
      : new THREE.Vector3(player.x + (dx / (dist || 1)) * lead, 0, player.z + (dz / (dist || 1)) * lead);
    const toGoal = goal.clone().sub(this.root.position);
    const gap = toGoal.length();
    const speed = Math.min(gap * 3, 40); // sprints to catch up, slows down when he's there
    const running = gap > 1;
    if (running) {
      this.root.position.addScaledVector(toGoal.normalize(), Math.min(gap, speed * dt));
      this.root.rotation.y = Math.atan2(-toGoal.x, -toGoal.z); // face where he runs
    } else {
      this.root.rotation.y = Math.atan2(player.x - this.root.position.x, player.z - this.root.position.z) + Math.PI; // face you
    }

    // Animation: run cycle, or wave at you while waiting.
    const swing = running ? Math.sin(this.time * 14) * 0.9 : 0;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing;
    this.arms[1].rotation.x = running ? swing : 0;
    this.arms[1].rotation.z = running ? 0 : 2.6 + Math.sin(this.time * 8) * 0.4; // wave!
    this.root.position.y = running ? Math.abs(Math.sin(this.time * 14)) * 0.05 : 0;

    // Pigeons circle his head, flapping.
    for (const p of this.pigeons) {
      const a = this.time * 2.2 + p.userData.phase;
      p.position.set(Math.cos(a) * 0.9, 2.3 + Math.sin(a * 2) * 0.15, Math.sin(a) * 0.9);
      p.rotation.y = -a;
      const flap = Math.sin(this.time * 22 + p.userData.phase) * 0.7;
      p.userData.wl.rotation.z = flap;
      p.userData.wr.rotation.z = -flap;
    }
    return appeared;
  }
}
