// textures.ts - textures we DRAW with code (no image files needed).

import * as THREE from 'three';
import { seededRandom } from './geometry';

// ---- Windows --------------------------------------------------------------
// A 16 x 16 grid of windows. Two textures:
//   map         - the wall: white (so the building colour shows) with dark windows
//   emissiveMap - black, except ~30% of windows glow warm yellow (lights on at 2am)
// Buildings repeat this grid over their walls, starting at a random spot.
export const WINDOW_GRID = 16; // windows per texture, each way
export const WINDOW_WIDTH = 3.2; // metres per window column
export const FLOOR_HEIGHT = 3.5; // metres per floor

export function createWindowTextures(anisotropy: number) {
  const CELL = 32; // pixels per window cell
  const size = CELL * WINDOW_GRID;
  const wall = document.createElement('canvas');
  const glow = document.createElement('canvas');
  wall.width = wall.height = glow.width = glow.height = size;
  const w = wall.getContext('2d')!;
  const g = glow.getContext('2d')!;

  w.fillStyle = '#ffffff';
  w.fillRect(0, 0, size, size);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, size, size);

  const rand = seededRandom(7);
  for (let row = 0; row < WINDOW_GRID; row++) {
    for (let col = 0; col < WINDOW_GRID; col++) {
      const x = col * CELL + 8, y = row * CELL + 7, ww = 16, wh = 19;
      // Dark glass, slightly blue (reflecting the night sky).
      w.fillStyle = '#1a2130';
      w.fillRect(x, y, ww, wh);
      // ~30% of windows are lit.
      const r = rand();
      if (r < 0.3) {
        // Mostly warm yellow, a few cool office-white, different brightness.
        const warm = rand() < 0.85;
        const b = 0.55 + rand() * 0.45;
        g.fillStyle = warm
          ? `rgb(${255 * b}, ${190 * b}, ${95 * b})`
          : `rgb(${200 * b}, ${215 * b}, ${255 * b})`;
        g.fillRect(x, y, ww, wh);
        // Window frame bar in the middle, so they read as windows not blobs.
        g.fillStyle = '#000000';
        g.fillRect(x + ww / 2 - 1, y, 2, wh);
      }
    }
  }

  const make = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy; // keeps windows sharp when seen at an angle
    return t;
  };
  return { map: make(wall), emissiveMap: make(glow) };
}

// ---- Water ripples ------------------------------------------------------------
// A tileable "normal map": tiny bumps that make the water's reflections wobble.
// Built from sine waves with whole-number frequencies so the edges line up.
export function createWaterNormalTexture(): THREE.Texture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const height = (u: number, v: number) =>
    Math.sin(2 * Math.PI * (3 * u + 1 * v)) * 0.5 +
    Math.sin(2 * Math.PI * (-2 * u + 5 * v)) * 0.3 +
    Math.sin(2 * Math.PI * (7 * u + 4 * v)) * 0.15 +
    Math.sin(2 * Math.PI * (11 * u - 9 * v)) * 0.08;
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Slope in each direction -> normal vector -> colour.
      const sx = (height(u + e, v) - height(u - e, v)) * 4;
      const sy = (height(u, v + e) - height(u, v - e)) * 4;
      const n = new THREE.Vector3(-sx, -sy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---- Night sky for reflections -----------------------------------------------
// A tiny picture of the sky all around us (an "environment map"). Shiny things
// like the river reflect it: deep blue above, orange city glow at the horizon.
export function createNightEnvironment(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#03050c'); // straight up
  grad.addColorStop(0.42, '#0d1a38'); // high sky
  grad.addColorStop(0.5, '#5a3a22'); // horizon: sodium-orange city glow
  grad.addColorStop(0.56, '#141a28');
  grad.addColorStop(1, '#05070d'); // below
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  // A few bright city lights along the horizon.
  const rand = seededRandom(3);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = rand() < 0.8 ? '#ffb060' : '#9fc0ff';
    ctx.fillRect(rand() * 256, 60 + rand() * 6, 1 + rand() * 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
