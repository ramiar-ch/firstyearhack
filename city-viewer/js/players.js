/** Player slots, bodies, walk update, join/leave, separation. */

import * as THREE from 'three';
import { InputState, fillBotInput } from './input.js';
import { createViewState, snapChase } from './chaseCam.js';
import { createProtagonist, strideLength, PRIMARY_AVATAR, PRIMARY_COLOUR } from './protagonist.js';

const WALK = 1.7;
const JOG = 5.5;
const GRAVITY = 22;
const JUMP_VY = 5;
const RADIUS = 0.28;
const EASE = 8;
const SEP_MIN = 0.6;
const MAX_SLOTS = 8;
const MAX_VIEWS = 4;

const SLOT_COLOURS = [
  PRIMARY_COLOUR, 0x2a6fdb, 0xe8a317, 0x2e9b6a, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xf1c40f,
];
const SLOT_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
const AVATARS = [
  PRIMARY_AVATAR,
  {style:'woman', skin:0xa76d4d, trousers:0x465461, scale:0.97},
  {style:'man', skin:0xe5b69a, trousers:0x57534f, scale:0.99},
  {style:'woman', skin:0x865b49, trousers:0x485350, scale:1.01},
];

let ctx = null;
/** @type {ReturnType<typeof createPlayer>[]} active players (order = join order) */
export const players = [];
/** Slot occupancy 0..7 */
const slotTaken = new Array(MAX_SLOTS).fill(false);
export let player = null;

const _m4 = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export function init(c) {
  ctx = Object.assign(ctx || {}, c);
}

export function createPlayer(slot, source, opts = {}) {
  const colour = opts.colour ?? SLOT_COLOURS[slot % SLOT_COLOURS.length];
  const name = opts.name ?? SLOT_NAMES[slot] ?? `P${slot + 1}`;
  const p = {
    id: opts.id ?? `p${slot}-${Math.random().toString(36).slice(2, 7)}`,
    slot,
    name,
    colour,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    vy: 0,
    yaw: 0,
    pitch: 0,
    bob: 0,
    grounded: true,
    input: opts.input ?? new InputState(),
    source,
    view: opts.view ?? createViewState(opts.camera ?? null),
    vehicle: null,
    radius: RADIUS,
    body: null,
    aW: null,
    gait: { phase: 0, weight: 0, run: 0, heading: null, vx: 0, vz: 0 },
    paused: false,
    leaveArmed: false,
  };
  if (opts.camera && p.view) p.view.camera = opts.camera;
  if (p.view && opts.firstPerson != null) p.view.firstPerson = opts.firstPerson;
  return p;
}

function allocSlot() {
  for (let i = 0; i < MAX_SLOTS; i++) if (!slotTaken[i]) return i;
  return -1;
}

export function updatePlayer(p, dt) {
  const inp = p.input;
  if (!inp) return;

  if (inp.pausePressed) p.paused = !p.paused;

  if (p.paused) {
    p.vel.x = 0;
    p.vel.z = 0;
    return;
  }

  if (!inp.connected && p.source && p.source.kind === 'gamepad') {
    // Idle: decay velocity, no look
    const k = 1 - Math.exp(-dt * EASE);
    p.vel.x = ctx.lerp(p.vel.x, 0, k);
    p.vel.z = ctx.lerp(p.vel.z, 0, k);
    ctx.moveWalk(p.pos, p.vel.x * dt, p.vel.z * dt);
    p.vy -= GRAVITY * dt;
    p.pos.y += p.vy * dt;
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      p.vy = 0;
      p.grounded = true;
    }
    return;
  }

  if (inp.toggleView && p.view) {
    p.view.firstPerson = !p.view.firstPerson;
    snapChase(p);
  }

  const fp = p.view && p.view.firstPerson;
  if (fp) {
    p.yaw += inp.lookYaw;
    p.pitch = ctx.clamp(p.pitch + inp.lookPitch, -1.52, 1.52);
  } else {
    p.yaw += inp.lookYaw;
    p.pitch = ctx.clamp(p.pitch + inp.lookPitch, -1.2, 0.35);
  }

  let wishX = inp.moveX;
  let wishY = inp.moveY;
  const wLen = Math.hypot(wishX, wishY);
  if (wLen > 1) {
    wishX /= wLen;
    wishY /= wLen;
  }
  const jog = ctx.clamp(inp.jog, 0, 1);
  const sp = WALK + (JOG - WALK) * jog;

  const fx = -Math.sin(p.yaw);
  const fz = -Math.cos(p.yaw);
  const rx = Math.cos(p.yaw);
  const rz = -Math.sin(p.yaw);
  const mx = fx * wishY + rx * wishX;
  const mz = fz * wishY + rz * wishX;

  const k = 1 - Math.exp(-dt * EASE);
  p.vel.x = ctx.lerp(p.vel.x, mx * sp, k);
  p.vel.z = ctx.lerp(p.vel.z, mz * sp, k);
  const xBefore = p.pos.x, zBefore = p.pos.z;
  ctx.moveWalk(p.pos, p.vel.x * dt, p.vel.z * dt);
  if (dt > 0) {
    p.gait.vx = (p.pos.x - xBefore) / dt;
    p.gait.vz = (p.pos.z - zBefore) / dt;
  }

  p.vy -= GRAVITY * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vy = 0;
    p.grounded = true;
    if (inp.jumpPressed) p.vy = JUMP_VY;
  } else {
    p.grounded = false;
  }

  const spd = Math.hypot(p.vel.x, p.vel.z);
  p.bob += dt * spd * 2.6;
}

export function ensureBody(p) {
  if (!ctx || !ctx.pedGeo || !ctx.crowdMaterial || !ctx.scene) return;
  if (p.body) return p.body;

  const avatar = AVATARS[p.slot % AVATARS.length];
  let mesh;
  if (p.slot === 0) {
    p.protagonist = createProtagonist(avatar, p.colour);
    mesh = p.protagonist.root;
    mesh.traverse(part => part.layers.set(1 + p.slot));
  } else {
    const geo = ctx.pedGeo(avatar.style);
    const aW = new Float32Array([0, Math.random() * 6.28, 0]);
    geo.setAttribute('walk', new THREE.InstancedBufferAttribute(aW, 3));
    for (const name of ['trousers', 'skin']) {
      geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(_c.setHex(avatar[name]).toArray()), 3));
    }

    mesh = new THREE.InstancedMesh(geo, ctx.crowdMaterial, 1);
    mesh.name = `${p.name} detailed pedestrian`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.customDepthMaterial = ctx.crowdDepth;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _c.setHex(p.colour));
    mesh.instanceColor.needsUpdate = true;
    mesh.layers.set(1 + p.slot);
    mesh.count = 1;
    p.aW = aW;
  }
  ctx.scene.add(mesh);

  // Name tag sprite on layer 9+slot
  if (!p.tag) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#' + (p.colour >>> 0).toString(16).padStart(6, '0');
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#fff';
    g.font = 'bold 36px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.name, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(0.9, 0.22, 1);
    spr.center.set(0.5, 0);
    spr.layers.set(9 + p.slot);
    ctx.scene.add(spr);
    p.tag = spr;
  }

  p.body = mesh;
  return mesh;
}

export function updateBody(p, dt = 0) {
  if (!p.body) return;
  const spd = Math.hypot(p.vel.x, p.vel.z);
  if (p.aW) {
    p.aW[0] = spd < 0.05 ? 0 : spd * 5.2;
    p.body.geometry.attributes.walk.needsUpdate = true;
  }
  if (p.protagonist) {
    const gait = p.gait;
    const speed = p.paused ? 0 : Math.hypot(gait.vx, gait.vz);
    const response = 1 - Math.exp(-dt * 10);
    gait.weight = ctx.lerp(gait.weight, Math.min(1, speed / 1.35), response);
    gait.run = ctx.lerp(gait.run, ctx.clamp((speed - 2) / 3.5, 0, 1), response);
    const backwards = p.input.moveY < -0.4 && Math.abs(p.input.moveX) < 0.4;
    const target = speed > 0.15 && !backwards ? Math.atan2(gait.vx, gait.vz) : p.yaw + Math.PI;
    const difference = target - (gait.heading ?? target);
    gait.heading = (gait.heading ?? target) + Math.atan2(Math.sin(difference), Math.cos(difference)) * (1 - Math.exp(-dt * 12));
    if (p.grounded) gait.phase = (gait.phase + (backwards ? -1 : 1) * speed * dt / strideLength(gait.run)) % 1;
    p.body.position.copy(p.pos);
    p.body.rotation.y = gait.heading;
    p.protagonist.animate(gait.phase, gait.weight, gait.run, !p.grounded, p.vy);
  } else {
    _q.setFromAxisAngle(UP, p.yaw + Math.PI);
    _p.set(p.pos.x, p.pos.y, p.pos.z);
    _m4.compose(_p, _q, _s.setScalar(AVATARS[p.slot % AVATARS.length].scale));
    p.body.setMatrixAt(0, _m4);
    p.body.instanceMatrix.needsUpdate = true;
  }
  const fp = p.view && p.view.firstPerson;
  p.body.visible = !fp;
  if (p.tag) {
    p.tag.position.set(p.pos.x, p.pos.y + 2.05, p.pos.z);
    p.tag.visible = !fp;
  }
}

export function separatePlayers(blockedAt) {
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= SEP_MIN || d < 1e-6) continue;
      const push = (SEP_MIN - d) * 0.5;
      const nx = dx / d;
      const nz = dz / d;
      const ax = a.pos.x - nx * push;
      const az = a.pos.z - nz * push;
      const bx = b.pos.x + nx * push;
      const bz = b.pos.z + nz * push;
      if (!blockedAt(ax, az)) {
        a.pos.x = ax;
        a.pos.z = az;
      }
      if (!blockedAt(bx, bz)) {
        b.pos.x = bx;
        b.pos.z = bz;
      }
    }
  }
}

/**
 * Join path. Returns player or null if full / no slot.
 * Views capped at 4 — extra slots exist in data but won't get a viewport (Phase 3).
 */
export function addPlayer(source, { name, camera, spawnBeside = true } = {}) {
  if (players.length >= MAX_VIEWS) return null;
  const slot = allocSlot();
  if (slot < 0) return null;

  const p = createPlayer(slot, source, {
    name: name || SLOT_NAMES[slot],
    camera: camera || (ctx && ctx.sharedCamera) || null,
    firstPerson: false,
  });
  slotTaken[slot] = true;

  if (players.length === 0 || !spawnBeside) {
    const spot = ctx.freeSpot(0, 0);
    p.pos.set(spot.x, 0, spot.z);
    p.yaw = 0;
  } else {
    const p0 = players[0];
    const side = 3 * (players.length % 2 === 0 ? 1 : -1);
    const rx = Math.cos(p0.yaw);
    const rz = -Math.sin(p0.yaw);
    const spot = ctx.freeSpot(p0.pos.x + rx * side, p0.pos.z + rz * side);
    p.pos.set(spot.x, 0, spot.z);
    p.yaw = p0.yaw;
  }
  p.pitch = 0;
  p.vel.set(0, 0, 0);
  ensureBody(p);
  snapChase(p);
  players.push(p);
  if (!player) player = p;
  player = players[0];
  return p;
}

export function removePlayer(id) {
  const i = players.findIndex((p) => p.id === id);
  if (i < 0) return false;
  const p = players[i];
  if (p.body) {
    ctx.scene.remove(p.body);
    if (p.protagonist) p.protagonist.dispose();
    else {
      p.body.geometry.dispose();
      p.body.dispose();
    }
    p.body = null;
  }
  if (p.tag) {
    ctx.scene.remove(p.tag);
    p.tag.material.map.dispose();
    p.tag.material.dispose();
    p.tag = null;
  }
  slotTaken[p.slot] = false;
  players.splice(i, 1);
  player = players[0] || null;
  return true;
}

export function seedPrimary(source, input, camera) {
  players.length = 0;
  slotTaken.fill(false);
  const p = createPlayer(0, source, { input, name: 'P1', camera, firstPerson: false });
  slotTaken[0] = true;
  players.push(p);
  player = p;
  return p;
}

/** Clear all players (e.g. leave play). Keeps positions if keepBodies false removes meshes. */
export function clearPlayers({ removeBodies = true } = {}) {
  if (removeBodies) {
    for (const p of players) {
      if (p.body) {
        ctx.scene.remove(p.body);
        p.body = null;
      }
      slotTaken[p.slot] = false;
    }
  }
  players.length = 0;
  player = null;
}

export function pollAndUpdateAll(dt, { blockedAt, botCtx }) {
  const leaveIds = [];
  for (const p of players) {
    if (p.source && p.source.kind === 'bot') {
      p.source._ctx = botCtx;
      fillBotInput(p, p.source, p.input, dt);
    } else if (p.source && p.source.poll) {
      p.source.poll(p.input, dt);
    }
    updatePlayer(p, dt);
    if (p.input && p.input.leaveHeld) leaveIds.push(p.id);
    else updateBody(p, dt);
  }
  for (const id of leaveIds) removePlayer(id);
  if (players.length) separatePlayers(blockedAt);
}

export function teleportRing(cx, cz, faceX, faceZ) {
  const n = players.length;
  for (let i = 0; i < n; i++) {
    const ang = (i / Math.max(1, n)) * Math.PI * 2;
    const ox = Math.cos(ang) * 1.2;
    const oz = Math.sin(ang) * 1.2;
    const spot = ctx.freeSpot(cx + ox, cz + oz);
    const p = players[i];
    p.pos.set(spot.x, 0, spot.z);
    if (faceX != null) p.yaw = Math.atan2(-(faceX - spot.x), -(faceZ - spot.z));
    p.pitch = 0.12;
    p.vel.set(0, 0, 0);
    snapChase(p);
  }
}

export function viewCount() {
  return Math.min(players.length, MAX_VIEWS);
}
