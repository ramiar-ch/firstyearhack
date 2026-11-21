/** Third-person chase camera with wall pull-in. */

import * as THREE from 'three';

const _pivot = new THREE.Vector3();
const _target = new THREE.Vector3();
const _ideal = new THREE.Vector3();
const _head = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const DEFAULT_D = 4.5;
const MIN_D = 2.5;
const MAX_D = 8;
const GROW_SPEED = 6;
const STEP = 0.25;
const SHORT = 0.35;
const MIN_Y = 0.4;
const HIDE_BODY_DIST = 1.0;
const ELEV_MIN = -0.35;
const ELEV_MAX = 1.2;

let ctx = null;

export function init(c) {
  ctx = c;
}

export function createViewState(camera) {
  return {
    camera: camera || null,
    distance: DEFAULT_D,
    pullD: DEFAULT_D,
    firstPerson: false,
    snap: true,
  };
}

export function snapChase(p) {
  if (p.view) p.view.snap = true;
}

function setIdeal(out, p, D, elev) {
  _pivot.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
  const cosE = Math.cos(elev);
  const sinE = Math.sin(elev);
  out.set(
    _pivot.x + Math.sin(p.yaw) * D * cosE,
    _pivot.y + D * sinE,
    _pivot.z + Math.cos(p.yaw) * D * cosE
  );
  return out;
}

/** Max distance along pivot→ideal before hitting a blocked XZ sample (minus SHORT). */
function maxClearDist(p, ideal, blockedAt) {
  _pivot.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
  const dx = ideal.x - _pivot.x;
  const dy = ideal.y - _pivot.y;
  const dz = ideal.z - _pivot.z;
  const dist3 = Math.hypot(dx, dy, dz);
  if (dist3 < 1e-4) return 0;

  const xzLen = Math.hypot(dx, dz);
  if (xzLen < 1e-4) return dist3;

  const steps = Math.max(1, Math.ceil(xzLen / STEP));
  let lastOk = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blockedAt(_pivot.x + dx * t, _pivot.z + dz * t)) {
      const clearAlong = Math.max(0, lastOk * xzLen - SHORT);
      return (clearAlong / xzLen) * dist3;
    }
    lastOk = t;
  }
  return dist3;
}

function placeAtDist(out, p, D, elev) {
  setIdeal(out, p, D, elev);
  return out;
}

export function updateChaseCam(p, dt, blockedAt) {
  const view = p.view;
  const cam = view && view.camera;
  if (!cam) return;

  if (p.input && p.input.camDist) {
    view.distance = ctx.clamp(view.distance + p.input.camDist * dt * 4, MIN_D, MAX_D);
  }

  const spd = Math.hypot(p.vel.x, p.vel.z);
  const bob =
    p.pos.y < 0.02 ? Math.sin(p.bob * 2) * 0.035 * Math.min(1, spd / 1.5) : 0;

  cam.layers.enableAll();
  cam.layers.disable(9 + p.slot);

  if (view.firstPerson) {
    cam.layers.disable(1 + p.slot);
    cam.position.set(p.pos.x, p.pos.y + 1.68 + bob, p.pos.z);
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    view.pullD = view.distance;
    view.snap = false;
    if (p.body) p.body.visible = false;
    return;
  }

  if (p.body) p.body.visible = true;

  const elev = ctx.clamp(-p.pitch, ELEV_MIN, ELEV_MAX);
  setIdeal(_ideal, p, view.distance, elev);
  const clearD = maxClearDist(p, _ideal, blockedAt);
  const maxD = Math.min(view.distance, clearD);

  if (view.snap) {
    view.pullD = maxD;
    view.snap = false;
  } else if (maxD < view.pullD) {
    view.pullD = maxD;
  } else {
    view.pullD = Math.min(maxD, view.pullD + GROW_SPEED * dt);
  }

  placeAtDist(_tmp, p, view.pullD, elev);
  // Final safety: if this point is blocked, pull further in
  let d = view.pullD;
  if (blockedAt(_tmp.x, _tmp.z)) {
    d = maxClearDist(p, setIdeal(_ideal, p, view.distance, elev), blockedAt);
    view.pullD = Math.min(view.pullD, d);
    placeAtDist(_tmp, p, view.pullD, elev);
  }
  cam.position.copy(_tmp);
  if (cam.position.y < MIN_Y) cam.position.y = MIN_Y;

  _target.set(p.pos.x, p.pos.y + 1.45, p.pos.z);
  cam.lookAt(_target);

  _head.set(p.pos.x, p.pos.y + 1.6, p.pos.z);
  if (cam.position.distanceTo(_head) < HIDE_BODY_DIST) cam.layers.disable(1 + p.slot);
  else cam.layers.enable(1 + p.slot);
}
