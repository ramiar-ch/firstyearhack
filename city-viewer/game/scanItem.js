// game/scanItem.js - "scan an item": a photo from the phone becomes a paper
// cut-out that your character HOLDS.
//   - in the car: the cut-out sticks up out of the roof and sways
//   - on foot (first-person walk): it's held in your hand at the bottom-right
//
// Background removal is simple on purpose (fast, no big AI model): we guess the
// background colour from the photo's edges and erase everything connected to
// the edges that looks like it. Works best on a plain table / sheet of paper.

import * as THREE from 'three';

const NAMES_A = ['Legendary', 'Cursed', 'Extremely British', 'Suspicious', 'Ancient', 'Turbo', 'Royal', 'Haunted'];
const NAMES_B = ['Relic', 'Artefact', 'Object of Power', 'Contraband', 'Heirloom', 'Trophy'];

/** Photo (data URL) -> canvas with the background removed + a white paper border. */
export async function makeCutout(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  // Work at max 256 px - fast enough to do instantly.
  const scale = Math.min(1, 256 / Math.max(img.width, img.height));
  const w = Math.max(8, Math.round(img.width * scale)), h = Math.max(8, Math.round(img.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;

  // 1. Background colour = average of the border pixels.
  let r = 0, gr = 0, b = 0, n = 0;
  const addPx = (x, y) => { const i = (y * w + x) * 4; r += px[i]; gr += px[i + 1]; b += px[i + 2]; n++; };
  for (let x = 0; x < w; x++) { addPx(x, 0); addPx(x, h - 1); }
  for (let y = 0; y < h; y++) { addPx(0, y); addPx(w - 1, y); }
  r /= n; gr /= n; b /= n;

  // 2. Flood fill from the edges: erase pixels that look like the background.
  const TOL = 60; // how different a colour can be and still count as background
  const isBg = (i) => Math.abs(px[i] - r) + Math.abs(px[i + 1] - gr) + Math.abs(px[i + 2] - b) < TOL * 1.6;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    px[p * 4 + 3] = 0; // transparent
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  g.putImageData(data, 0, 0);

  // If almost everything got erased (busy photo), keep the whole photo instead.
  let kept = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 0) kept++;
  if (kept < w * h * 0.08) g.drawImage(img, 0, 0, w, h);

  // 3. Paper cut-out look: draw the shape in white, a few px bigger, behind it.
  const pad = 8;
  const out = document.createElement('canvas');
  out.width = w + pad * 2; out.height = h + pad * 2;
  const o = out.getContext('2d');
  const white = document.createElement('canvas');
  white.width = w; white.height = h;
  const wg = white.getContext('2d');
  wg.drawImage(c, 0, 0);
  wg.globalCompositeOperation = 'source-in';
  wg.fillStyle = '#fff';
  wg.fillRect(0, 0, w, h);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    o.drawImage(white, pad + Math.cos(a) * 5, pad + Math.sin(a) * 5);
  }
  o.drawImage(c, pad, pad);
  return out;
}

export function funnyName() {
  const pick = (l) => l[Math.floor(Math.random() * l.length)];
  return `The ${pick(NAMES_A)} ${pick(NAMES_B)}`;
}

/** Attach a cut-out to a car: stands up out of the roof and sways. */
export function holdInCar(car, canvas) {
  if (car.mesh.userData.held) car.mesh.remove(car.mesh.userData.held);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const height = 1.6; // metres tall
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(height * (canvas.width / canvas.height), height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
  );
  plane.position.set(0, 1.55 + height / 2, 0.3); // on the roof
  car.mesh.add(plane);
  car.mesh.userData.held = plane;
}

/** Make held items sway (call every frame). */
export function swayHeld(cars, time) {
  for (const car of cars) {
    const held = car && car.mesh.userData.held;
    if (held) held.rotation.y = Math.sin(time * 1.6) * 0.5; // gently turning like paper in the wind
  }
}

/** First-person: show the cut-out "in your hand" at the bottom-right of the screen. */
export function holdInHand(canvas, name) {
  let el = document.getElementById('held-item');
  if (!el) {
    el = document.createElement('div');
    el.id = 'held-item';
    el.innerHTML = '<img alt=""><span></span>';
    document.body.appendChild(el);
  }
  el.querySelector('img').src = canvas.toDataURL('image/png');
  el.querySelector('span').textContent = name;
}
