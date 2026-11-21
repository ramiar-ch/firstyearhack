// labels.ts - floating name tags above landmarks (King's College, Bush House...).
//
// Each label is a Sprite: a flat picture that always turns to face the camera.
// The text is drawn onto a canvas. Labels fade out when you're far away.

import * as THREE from 'three';
import type { Landmark } from './data';

const FULL_UNTIL = 220; // metres from the player: fully visible up to here...
const GONE_AT = 450; // ...and completely faded out by here

interface Label {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
}

function makeLabelTexture(text: string) {
  const font = '600 44px system-ui, sans-serif';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 48;
  const h = 76;
  canvas.width = w;
  canvas.height = h;

  // Dark rounded box with a thin sodium-orange border.
  ctx.fillStyle = 'rgba(6, 9, 18, 0.82)';
  ctx.strokeStyle = '#ff9a2e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 12);
  ctx.fill();
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = '#ffe2bd';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 24, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

export function createLabels(landmarks: Landmark[]) {
  const group = new THREE.Group();
  const labels: Label[] = [];

  for (const lm of landmarks) {
    const { tex, aspect } = makeLabelTexture(lm.label);
    const material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false, // always drawn on top of buildings
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    const height = 4.5; // metres tall in the world
    sprite.scale.set(height * aspect, height, 1);
    sprite.position.set(lm.x, lm.height + 10, lm.z);
    sprite.renderOrder = 10; // draw after everything else
    group.add(sprite);
    labels.push({ sprite, material });
  }

  return {
    group,
    /** Fade labels by distance from the player. Call every frame. */
    update(focus: THREE.Vector3) {
      for (const { sprite, material } of labels) {
        const d = Math.hypot(sprite.position.x - focus.x, sprite.position.z - focus.z);
        const opacity = THREE.MathUtils.clamp(1 - (d - FULL_UNTIL) / (GONE_AT - FULL_UNTIL), 0, 1);
        material.opacity = opacity;
        sprite.visible = opacity > 0.01;
      }
    },
  };
}
