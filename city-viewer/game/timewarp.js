// game/timewarp.js - escape the police by warping to 1997 in a red phone box.
//
//  1. Crash the car -> POLICE ALERT (flashing blue/red HUD + siren beeps).
//  2. Get to the glowing red phone box near KCL and press E.
//  3. Flash! -> 1997 MODE: chunky pixels, CRT scanlines, top-down camera,
//     and the police are gone ("The 1997 Met has never heard of you").
//  4. Use the phone box again (or press R) to warp back to today.

import * as THREE from 'three';

export class TimeWarp {
  /**
   * x, z: where the phone box stands.
   * setPixelRatio(r): makes the renderer draw at a lower/higher resolution.
   * onRetroChange(isRetro): lets the game switch camera etc.
   */
  constructor(scene, x, z, { setPixelRatio, getPixelRatio, onRetroChange }) {
    this.setPixelRatio = setPixelRatio;
    this.getPixelRatio = getPixelRatio;
    this.onRetroChange = onRetroChange;
    this.retro = false;
    this.wanted = false;
    this.position = new THREE.Vector3(x, 0, z);
    this.box = buildPhoneBox();
    this.box.position.copy(this.position);
    scene.add(this.box);

    // HUD bits: police alert, white flash, CRT scanlines.
    this.alert = addDiv('police-alert', '★ POLICE ALERT ★<small>Hide in the red phone box!</small>');
    this.flash = addDiv('warp-flash', '');
    this.crt = addDiv('crt', '');
    this.siren = null;
    this.onEvent = () => {}; // set by the game: 'police' / 'warp' (for phone haptics)
  }

  /** Is (pos) close enough to the phone box to use it? */
  near(pos, distance) {
    return Math.hypot(pos.x - this.position.x, pos.z - this.position.z) < distance;
  }

  /** Called after a crash: the police are after you (not in 1997!). */
  raiseWanted() {
    if (this.wanted || this.retro) return;
    this.wanted = true;
    this.alert.style.display = 'block';
    this.startSiren();
    this.onEvent('police');
  }

  /** Flash, then swap between today and 1997. */
  warp() {
    if (!this.retro) this.onEvent('warp'); // only count trips TO 1997 (not the boot screen's trip back)
    this.flash.classList.remove('go');
    void this.flash.offsetWidth; // restart the CSS animation
    this.flash.classList.add('go');
    setTimeout(() => this.setRetro(!this.retro), 250); // swap while the screen is white
  }

  /** quiet = true: no "1997" message (used by the boot screen). */
  setRetro(on, quiet = false) {
    this.retro = on;
    document.body.classList.toggle('retro', on);
    if (on) {
      // Draw at ~320 pixels wide, then the browser blows it up with sharp pixels.
      this.normalRatio = this.getPixelRatio();
      this.setPixelRatio(320 / innerWidth);
      // The 1997 police have never heard of you.
      this.wanted = false;
      this.alert.style.display = 'none';
      this.stopSiren();
    } else {
      this.setPixelRatio(this.normalRatio ?? 1);
    }
    this.onRetroChange(on, quiet);
  }

  update() {
    // Phone box beam pulses, brighter while the police are after you.
    const beam = this.box.userData.beam;
    beam.material.opacity = (this.wanted ? 0.55 : 0.25) + Math.sin(performance.now() / 200) * 0.1;
  }

  // ---- A simple two-tone siren with Web Audio (no sound files needed) ----
  startSiren() {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.04; // quiet!
      osc.type = 'square';
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      let high = false;
      const timer = setInterval(() => { high = !high; osc.frequency.value = high ? 960 : 720; }, 450);
      this.siren = { ctx, timer };
    } catch {
      /* no audio available - that's fine */
    }
  }

  stopSiren() {
    if (!this.siren) return;
    clearInterval(this.siren.timer);
    this.siren.ctx.close();
    this.siren = null;
  }
}

function addDiv(id, html) {
  const d = document.createElement('div');
  d.id = id;
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

/** A classic red London phone box (original simple model) + a glowing beam above it. */
function buildPhoneBox() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffd88a, emissiveIntensity: 1.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.5, 1.1), red);
  body.position.y = 1.25;
  const windows = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.3, 1.12), glass); // lit windows
  windows.position.y = 1.3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.3, 1.25), red);
  roof.position.y = 2.65;
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.18, 1.14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 }));
  sign.position.y = 2.35;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 24, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.3, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  g.add(body, windows, roof, sign, beam);
  g.userData.beam = beam;
  return g;
}
