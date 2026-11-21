/** Per-view HUD strips + join overlay + multi-arrow minimap. */

import * as THREE from 'three';

let root = null;
const viewHud = new Map();
const _dir = new THREE.Vector3();

export function init() {
  root = document.getElementById('view-huds');
  if (!root) {
    root = document.createElement('div');
    root.id = 'view-huds';
    document.getElementById('ui').appendChild(root);
  }
}

export function syncViewHuds(layout, playersById, i18n) {
  const live = new Set();
  for (const v of layout) {
    if (!v.playerId || v.sharedMap) continue;
    live.add(v.playerId);
    let el = viewHud.get(v.playerId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'view-hud';
      el.innerHTML =
        '<div class="vh-strip"></div><div class="vh-name"></div><div class="vh-street"></div>';
      root.appendChild(el);
      viewHud.set(v.playerId, el);
    }
    const p = playersById.get(v.playerId);
    el.style.display = 'block';
    el.style.left = `${v.x}px`;
    el.style.top = `${v.y}px`;
    el.style.width = `${v.w}px`;
    el.style.height = `${v.h}px`;
    if (p) {
      el.querySelector('.vh-strip').style.background =
        '#' + (p.colour >>> 0).toString(16).padStart(6, '0');
      const pause = p.paused ? ` (${i18n ? i18n('paused') : 'paused'})` : '';
      el.querySelector('.vh-name').textContent = p.name + pause;
      el.querySelector('.vh-street').textContent = p._streetName || '';
    }
  }
  for (const [id, el] of [...viewHud]) {
    if (!live.has(id)) {
      el.remove();
      viewHud.delete(id);
    }
  }
}

export function setJoinOverlay(visible, text) {
  let el = document.getElementById('join-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'join-overlay';
    document.getElementById('ui').appendChild(el);
  }
  el.textContent = text || '';
  el.style.display = visible ? 'block' : 'none';
}

export function drawMultiMinimap(mmCtx, mapBg, RH, players, mode, controls, camera) {
  const S = 440;
  mmCtx.drawImage(mapBg, 0, 0);
  const W = (v) => ((v / RH + 1) / 2) * S;

  if (mode !== 'walk' || !players.length) {
    camera.getWorldDirection(_dir);
    const yaw = Math.atan2(_dir.x, -_dir.z);
    const pos = mode === 'orbit' ? controls.target : camera.position;
    drawArrow(mmCtx, W(pos.x), W(pos.z), yaw, '#ffd23f');
  } else {
    for (const p of players) {
      const hex = '#' + (p.colour >>> 0).toString(16).padStart(6, '0');
      drawArrow(mmCtx, W(p.pos.x), W(p.pos.z), p.yaw, hex);
    }
  }
  mmCtx.fillStyle = 'rgba(255,255,255,.85)';
  mmCtx.font = 'bold 18px sans-serif';
  mmCtx.fillText('N', S - 26, 26);
}

/** Edge-of-screen arrows toward off-screen players (per view). */
export function drawEdgeArrows(layout) {
  let layer = document.getElementById('edge-arrows');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'edge-arrows';
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2' });
    document.getElementById('ui').appendChild(layer);
  }
  layer.innerHTML = '';
  if (layout.length < 2) return;

  for (const v of layout) {
    if (!v.player || !v.camera) continue;
    const cam = v.camera;
    for (const other of layout) {
      if (!other.player || other.playerId === v.playerId) continue;
      const p = other.player.pos;
      const v3 = new THREE.Vector3(p.x, p.y + 1.6, p.z);
      v3.project(cam);
      if (v3.z > 1) continue; // behind far
      const onScreen = v3.x >= -1 && v3.x <= 1 && v3.y >= -1 && v3.y <= 1 && v3.z >= -1 && v3.z <= 1;
      if (onScreen) continue;
      const ang = Math.atan2(v3.y, v3.x);
      const cx = v.x + v.w * 0.5;
      const cy = v.y + v.h * 0.5;
      const pad = 28;
      const rx = (v.w * 0.5 - pad) * Math.cos(ang);
      const ry = -(v.h * 0.5 - pad) * Math.sin(ang);
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;left:${cx + rx}px;top:${cy + ry}px;width:0;height:0;transform:translate(-50%,-50%) rotate(${-ang}rad);border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid #${(other.player.colour >>> 0).toString(16).padStart(6, '0')};opacity:.85`;
      layer.appendChild(el);
    }
  }
}

function drawArrow(mmCtx, x, y, yaw, fill) {
  mmCtx.save();
  mmCtx.translate(x, y);
  mmCtx.rotate(yaw);
  const gr = mmCtx.createRadialGradient(0, 0, 0, 0, 0, 46);
  gr.addColorStop(0, 'rgba(255,255,255,.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  mmCtx.fillStyle = gr;
  mmCtx.beginPath();
  mmCtx.moveTo(0, 0);
  mmCtx.arc(0, 0, 46, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.fillStyle = fill;
  mmCtx.strokeStyle = '#111';
  mmCtx.lineWidth = 2;
  mmCtx.beginPath();
  mmCtx.moveTo(0, -10);
  mmCtx.lineTo(7, 8);
  mmCtx.lineTo(0, 4);
  mmCtx.lineTo(-7, 8);
  mmCtx.closePath();
  mmCtx.fill();
  mmCtx.stroke();
  mmCtx.restore();
}
