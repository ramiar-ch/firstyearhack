/** Split-screen layouts (CSS pixels). Recomputed on resize / join / leave. */

import * as THREE from 'three';

const DIV = 2;

let ctx = null;
/** @type {Array} */
export let layout = [];

export function init(c) {
  ctx = c;
}

/**
 * @param {Array} players
 * @param {number} W
 * @param {number} H
 */
export function recompute(players, W, H) {
  const n = Math.min(players.length, 4);
  layout = [];
  if (n <= 0) return layout;

  const cells = [];
  if (n === 1) {
    cells.push({ x: 0, y: 0, w: W, h: H });
  } else if (n === 2) {
    const w = (W - DIV) / 2;
    cells.push({ x: 0, y: 0, w, h: H });
    cells.push({ x: w + DIV, y: 0, w: W - w - DIV, h: H });
  } else {
    const w = (W - DIV) / 2;
    const h = (H - DIV) / 2;
    cells.push({ x: 0, y: 0, w, h });
    cells.push({ x: w + DIV, y: 0, w: W - w - DIV, h });
    cells.push({ x: 0, y: h + DIV, w, h: H - h - DIV });
    cells.push({ x: w + DIV, y: h + DIV, w: W - w - DIV, h: H - h - DIV });
  }

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (n === 3 && i === 3) {
      layout.push({ playerId: null, sharedMap: true, ...c, camera: null, player: null });
      continue;
    }
    const p = players[Math.min(i, players.length - 1)];
    if (!p) continue;

    let cam;
    if (n === 1 && ctx.sharedCamera) {
      cam = ctx.sharedCamera;
      cam.fov = 58;
    } else {
      if (!p.view) p.view = { camera: null, distance: 4.5, pullD: 4.5, firstPerson: false, snap: true };
      if (!p._splitCam) {
        p._splitCam = new THREE.PerspectiveCamera(58, 1, 0.1, 14000);
      }
      cam = p._splitCam;
      cam.fov = n === 2 ? 65 : 58;
    }
    if (p.view) p.view.camera = cam;
    cam.aspect = c.w / Math.max(1, c.h);
    cam.updateProjectionMatrix();
    layout.push({ playerId: p.id, sharedMap: false, ...c, camera: cam, player: p });
  }
  return layout;
}

export function toWebGL(rect, canvasH) {
  return {
    x: rect.x,
    y: canvasH - rect.y - rect.h,
    w: rect.w,
    h: rect.h,
  };
}
