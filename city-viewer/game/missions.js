// game/missions.js - delivery missions: pick up -> drop off -> MISSION PASSED.
//
// How a mission goes:
//   1. A new job appears: "Pick up <item> at <place>". An ORANGE light beam
//      marks the pickup spot (and a dot on the minimap).
//   2. Reach it (in the car or on foot) -> parcel collected, a timer starts,
//      and a BLUE beam marks the drop-off at another landmark.
//   3. Reach the drop-off before time runs out -> "MISSION PASSED +£5".
//      Too slow -> "MISSION FAILED". Either way a new job comes 3 s later.
// The HUD at the top shows where to go, how far, which way (arrow) and time.

import * as THREE from 'three';

const REWARD = 5; // £ per delivery (as in the brief)
const ARRIVE_DISTANCE = 9; // metres from the marker centre counts as "there"
const NEXT_JOB_DELAY = 3; // seconds between jobs

// Funny London cargo (all original).
const ITEMS = [
  'a box of KCL exam papers', 'a very late pizza', "a barrister's wig", 'a lost Oyster card',
  'a theatre costume', 'a crate of Earl Grey', 'a suspiciously heavy umbrella', 'a signed rugby ball',
  'a tray of jellied eels', "a professor's forgotten laptop", 'a bag of Somerset House ice skates',
];

/** Smooth 0..1 curve for fading things in/out. */
const smooth = (t) => t * t * (3 - 2 * t);

export class MissionManager {
  /**
   * scene: where to put the light beams.
   * places: [{ name, x, z }] reachable spots (already snapped onto roads).
   */
  constructor(scene, places) {
    this.scene = scene;
    this.places = places;
    this.money = 0;
    this.passed = 0;
    this.state = 'waiting'; // 'waiting' -> 'pickup' -> 'dropoff' -> 'waiting' ...
    this.wait = 1.5; // first job comes soon after the intro
    this.timeLeft = 0;
    this.pickup = null;
    this.dropoff = null;
    this.item = '';

    this.pickupBeam = makeBeam(0xff8c1a); // orange
    this.dropoffBeam = makeBeam(0x3a8bff); // blue
    scene.add(this.pickupBeam, this.dropoffBeam);
    this.buildHud();
  }

  // ---- HUD (plain HTML) ------------------------------------------------------
  buildHud() {
    this.hud = document.createElement('div');
    this.hud.id = 'mission';
    this.hud.innerHTML = `
      <div class="m-money">£<span>0</span></div>
      <div class="m-task">
        <span class="m-arrow">▲</span>
        <div><div class="m-title"></div><div class="m-sub"></div></div>
        <div class="m-timer"></div>
      </div>`;
    document.body.appendChild(this.hud);
    this.banner = document.createElement('div');
    this.banner.id = 'mission-banner';
    this.banner.innerHTML = '<div class="b-big"></div><div class="b-small"></div>';
    document.body.appendChild(this.banner);
    this.bannerTime = 0;
  }

  showBanner(big, small, kind) {
    this.banner.querySelector('.b-big').textContent = big;
    this.banner.querySelector('.b-small').textContent = small;
    this.banner.className = kind; // 'passed' / 'failed' / 'info'
    this.bannerTime = 2.8; // seconds on screen
  }

  // ---- Choosing jobs ---------------------------------------------------------
  /** A random place at least `minDist` metres from (x, z) (and not `except`). */
  pickPlace(x, z, minDist, maxDist, except) {
    const ok = this.places.filter((p) => {
      const d = Math.hypot(p.x - x, p.z - z);
      return p !== except && d >= minDist && d <= maxDist;
    });
    const list = ok.length ? ok : this.places.filter((p) => p !== except);
    return list[Math.floor(Math.random() * list.length)];
  }

  newJob(pos) {
    this.item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    this.pickup = this.pickPlace(pos.x, pos.z, 120, 500, null);
    this.dropoff = null;
    this.state = 'pickup';
    placeBeam(this.pickupBeam, this.pickup);
    this.dropoffBeam.visible = false;
    this.showBanner('NEW JOB', `Pick up ${this.item} at ${this.pickup.name}`, 'info');
  }

  collect() {
    this.dropoff = this.pickPlace(this.pickup.x, this.pickup.z, 250, 800, this.pickup);
    const dist = Math.hypot(this.dropoff.x - this.pickup.x, this.dropoff.z - this.pickup.z);
    // Time limit: London streets aren't straight, so allow ~9 m/s plus a bit.
    this.timeLeft = Math.ceil((dist / 9 + 20) / 5) * 5;
    this.state = 'dropoff';
    this.pickupBeam.visible = false;
    placeBeam(this.dropoffBeam, this.dropoff);
    this.showBanner('PARCEL COLLECTED', `Deliver to ${this.dropoff.name} · ${this.timeLeft} s`, 'info');
  }

  finish(success) {
    this.dropoffBeam.visible = false;
    this.state = 'waiting';
    this.wait = NEXT_JOB_DELAY;
    if (success) {
      this.money += REWARD;
      this.passed++;
      this.hud.querySelector('.m-money span').textContent = String(this.money);
      this.hud.querySelector('.m-money').classList.remove('pop');
      void this.hud.offsetWidth; // restart the CSS animation
      this.hud.querySelector('.m-money').classList.add('pop');
      this.showBanner('MISSION PASSED', `+£${REWARD}`, 'passed');
    } else {
      this.showBanner('MISSION FAILED', 'Too slow! The customer gave 1 star.', 'failed');
    }
  }

  // ---- Every frame ---------------------------------------------------------------
  /**
   * pos: where the player is (the car when driving).
   * cameraHeading: compass angle the camera faces (radians, 0 = north), for the arrow.
   * active: false in Orbit/Fly mode - the timer pauses and the HUD hides.
   */
  update(dt, pos, cameraHeading, active) {
    this.hud.style.display = active ? 'block' : 'none';
    // Beams gently pulse so they catch the eye.
    const pulse = 0.55 + Math.sin(performance.now() / 300) * 0.15;
    this.pickupBeam.material.opacity = this.dropoffBeam.material.opacity = pulse;

    // Banner fade in/out.
    if (this.bannerTime > 0) this.bannerTime -= dt;
    const b = this.bannerTime;
    this.banner.style.opacity = String(b > 2.5 ? smooth((2.8 - b) / 0.3) : smooth(Math.min(1, Math.max(0, b) / 0.5)));
    if (!active) return;

    if (this.state === 'waiting') {
      this.wait -= dt;
      if (this.wait <= 0) this.newJob(pos);
    } else if (this.state === 'pickup') {
      if (dist2d(pos, this.pickup) < ARRIVE_DISTANCE) this.collect();
    } else if (this.state === 'dropoff') {
      this.timeLeft -= dt;
      if (dist2d(pos, this.dropoff) < ARRIVE_DISTANCE) this.finish(true);
      else if (this.timeLeft <= 0) this.finish(false);
    }
    this.updateHud(pos, cameraHeading);
  }

  updateHud(pos, cameraHeading) {
    const task = this.hud.querySelector('.m-task');
    const target = this.state === 'pickup' ? this.pickup : this.state === 'dropoff' ? this.dropoff : null;
    task.style.display = target ? 'flex' : 'none';
    if (!target) return;

    task.className = `m-task ${this.state}`;
    this.hud.querySelector('.m-title').textContent =
      this.state === 'pickup' ? `PICK UP · ${this.pickup.name}` : `DELIVER · ${this.dropoff.name}`;
    this.hud.querySelector('.m-sub').textContent = `${Math.round(dist2d(pos, target))} m · ${this.item}`;

    // Arrow: which way the target is, compared with where the camera looks.
    const bearing = Math.atan2(target.x - pos.x, -(target.z - pos.z)); // 0 = north, clockwise
    this.hud.querySelector('.m-arrow').style.transform = `rotate(${bearing - cameraHeading}rad)`;

    const timer = this.hud.querySelector('.m-timer');
    if (this.state === 'dropoff') {
      const t = Math.max(0, Math.ceil(this.timeLeft));
      timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      timer.classList.toggle('hurry', t <= 10);
    } else timer.textContent = '';
  }

  /** Draw the target on the viewer's minimap. toMap(v) turns metres into minimap pixels. */
  drawOnMinimap(ctx, toMap, playRadius) {
    // Play-area circle.
    ctx.strokeStyle = 'rgba(255,140,26,.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toMap(0), toMap(0), toMap(playRadius) - toMap(0), 0, Math.PI * 2);
    ctx.stroke();
    // Current target.
    const target = this.state === 'pickup' ? this.pickup : this.state === 'dropoff' ? this.dropoff : null;
    if (!target) return;
    ctx.fillStyle = this.state === 'pickup' ? '#ff8c1a' : '#3a8bff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(toMap(target.x), toMap(target.z), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ---- Helpers ----------------------------------------------------------------------
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** A tall see-through glowing column (visible from far away) + ring on the ground. */
function makeBeam(colour) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 4, 80, 32, 1, true).translate(0, 40, 0),
    new THREE.MeshBasicMaterial({
      color: colour, transparent: true, opacity: 0.6, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(ARRIVE_DISTANCE - 1.5, ARRIVE_DISTANCE, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.position.y = 0.3;
  beam.add(ring);
  beam.visible = false;
  beam.renderOrder = 3;
  return beam;
}

function placeBeam(beam, place) {
  beam.position.set(place.x, 0, place.z);
  beam.visible = true;
}
