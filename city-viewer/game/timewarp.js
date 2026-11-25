// Phone box = TIME MACHINE between 2026 and 1997, plus the police alert.
//
// The idea: in 2026 London is full of data (CCTV, number-plate cameras,
// Snowflake) so the Met can always track you. In 1997 none of that existed:
// warp there and the police LOSE you, and new crashes don't get you wanted.
// Use the phone box (or R) again to come back to 2026.

import * as THREE from 'three';
import { telephoneKiosk } from '../js/phoneKiosk.js';

export class TimeWarp {
  /**
   * x, z: where the phone box stands.
   * onRetroChange(isRetro) updates the cameras and renderer.
   */
  constructor(scene, x, z, { onRetroChange }) {
    this.onRetroChange = onRetroChange;
    this.retro = false;
    this.pendingRetro = null;
    this.paused = false;
    this.wanted = null;
    this.position = new THREE.Vector3(x, 0, z);
    this.box = buildPhoneBox();
    this.box.position.copy(this.position);
    scene.add(this.box);

    // HUD bits: police alert, white flash, CRT scanlines.
    this.alert = addDiv('police-alert', '★ POLICE ALERT ★<small>Patrol inbound · Escape at the red phone box</small>');
    this.flash = addDiv('warp-flash', '');
    this.crt = addDiv('crt', '');
    this.siren = null;
    this.onEvent = () => {}; // set by the game: 'police' / 'warp' (for phone haptics)
    this.onLost = () => {}; // set by the game: police lost you (warped to 1997 mid-chase)
  }

  /** Is (pos) close enough to the phone box to use it? */
  near(pos, distance) {
    return Math.hypot(pos.x - this.position.x, pos.z - this.position.z) < distance;
  }

  /** Track the driver who triggered this pursuit. */
  raiseWanted(driver) {
    if (this.wanted) return;
    if (this.retro) return; // 1997: no CCTV, no data - nobody can track you
    this.wanted = driver;
    this.alert.style.display = 'block';
    this.startSiren();
    this.onEvent('police');
  }

  /** Phone box: travel 2026 <-> 1997 (flash). Going to 1997 mid-chase = the police lose you. */
  escape() {
    if (this.pendingRetro || this.paused) return;
    const toPast = !this.retro;
    this.onEvent('warp');
    this.flashScreen();
    this.pendingRetro = { toPast, remaining: 0.2 }; // swap while the screen is white
    if (toPast && this.wanted) { this.clearWanted(); this.onLost(); }
  }

  clearWanted() {
    this.wanted = null;
    this.alert.style.display = 'none';
    this.stopSiren();
  }

  flashScreen() {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth; // restart the CSS animation
    this.flash.classList.add('go');
  }

  setRetro(on) {
    if (this.retro === on) return;
    this.retro = on;
    document.body.classList.toggle('retro', on);
    this.onRetroChange(on);
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.stopSiren();
    else if (this.wanted && !this.siren) this.startSiren();
  }

  update(dt) {
    if (this.pendingRetro && (this.pendingRetro.remaining -= dt) <= 0) {
      const {toPast} = this.pendingRetro;
      this.pendingRetro = null;
      this.setRetro(toPast);
    }
    // (1997 is now a place you CHOOSE to go to - see escape() - not automatic.)
    // Phone box beam pulses, brighter while the police are after you.
    const beam = this.box.userData.beam;
    beam.material.opacity = (this.wanted ? 0.55 : 0.25) + Math.sin(performance.now() / 200) * 0.1;
  }

  // ---- A simple two-tone siren with Web Audio (no sound files needed) ----
  startSiren() {
    if (this.paused) return;
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

/** A red London telephone kiosk with the mission beacon above it. */
function buildPhoneBox() {
  const g = telephoneKiosk();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 24, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.3, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  g.add(beam);
  g.userData.beam = beam;
  return g;
}
