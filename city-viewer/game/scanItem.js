// game/scanItem.js - "scan an item": a photo from the phone becomes a paper
// cut-out that your character HOLDS.
//   - in the car: the cut-out sticks up out of the roof and sways
//   - on foot (first-person walk): it's held in your hand at the bottom-right
//
// The cut-out itself is made in game/cutout.js (shared with the phone).

import * as THREE from 'three';
import { makeCutout } from './cutout.js';

const NAMES_A = ['Legendary', 'Cursed', 'Extremely British', 'Suspicious', 'Ancient', 'Turbo', 'Royal', 'Haunted'];
const NAMES_B = ['Relic', 'Artefact', 'Object of Power', 'Contraband', 'Heirloom', 'Trophy'];

/**
 * Scanned image -> cut-out canvas.
 * cut = true: the phone already made the cut-out (PNG) - just load it.
 * cut = false: a raw photo - make the cut-out here (game/cutout.js).
 */
export async function toCutout(dataUrl, cut) {
  if (!cut) return makeCutout(dataUrl);
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
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
