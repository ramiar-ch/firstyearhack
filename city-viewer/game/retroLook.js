// game/retroLook.js - makes 1997 mode look like a real late-90s game, not just "pixelated":
//   - a hand-picked 24-colour 1997 palette (very light dithering)
//   - thick purple fog = short draw distance (buildings "pop in" like on old consoles)
//   - chunky, sharp textures (no smooth blending)
//   - no modern glow or soft shadows
// (The low resolution + scanlines still come from game/timewarp.js.)

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Screen filter: snap every pixel to the NEAREST colour of a hand-picked
// 24-colour "1997" palette (London navy, brick red, sodium orange, park green,
// Portland stone...). A very light 4x4 dither softens big gradients.
const PALETTE = [
  0x0b0f1a, 0x1b2436, 0x2c3d5c, 0x3f5f8c, 0x6f97c8, 0xa9c6e8, // night/sky blues
  0x2a2a2e, 0x4d4d55, 0x7a7a82, 0xa8a8ae, 0xd6d4cc, 0xf4f0e2, // greys + stone + white
  0x5a2a1e, 0x8e4634, 0xc0623e, 0xe08a4c, 0xffb24a, 0xffe08a, // bricks, oranges, warm light
  0x1f3a22, 0x3f6b35, 0x7aa04a, 0x3a1f3f, 0xc8102e, 0x29b5e8, // greens, purple, red, cyan accent
];
const PaletteShader = {
  uniforms: {
    tDiffuse: { value: null },
    // Raw 0..1 values (no colour-space conversion: this filter runs on the final screen colours).
    palette: { value: PALETTE.map((c) => new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255)) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 palette[24]; varying vec2 vUv;
    float bayer(vec2 p){
      int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return m[i] / 16. - 0.5;
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = clamp((c - 0.5) * 1.15 + 0.52, 0.0, 1.0);          // a little more contrast, like an old CRT
      c += bayer(gl_FragCoord.xy) * 0.07;                    // very light dither
      vec3 best = palette[0]; float bestD = 10.0;
      for (int i = 0; i < 24; i++) {                          // nearest palette colour
        vec3 d = (c - palette[i]) * vec3(0.9, 1.2, 0.7);      // eyes are most sensitive to green
        float dd = dot(d, d);
        if (dd < bestD) { bestD = dd; best = palette[i]; }
      }
      gl_FragColor = vec4(best, 1.0);
    }`,
};

export class RetroLook {
  /** restoreLighting(): the viewer's own function to put fog colours etc. back. */
  constructor({ composer, bloom, scene, fog, sun, restoreLighting }) {
    Object.assign(this, { composer, bloom, scene, fog, sun, restoreLighting });
    this.on = false;
    this.pass = new ShaderPass(PaletteShader);
    this.pass.enabled = false;
    composer.addPass(this.pass); // last pass = drawn to the screen
    this.saved = new Map(); // texture -> its original smooth filters
  }

  set(on) {
    if (on === this.on) return;
    this.on = on;
    this.pass.enabled = on;
    this.bloom.enabled = !on; // no modern glow in 1997
    if (on) {
      this.shadow = this.sun.castShadow;
      this.sun.castShadow = false;
      this.density = this.fog.density;
      this.fog.density = 0.0055; // ~150 m draw distance
    } else {
      this.sun.castShadow = this.shadow ?? true;
      this.fog.density = this.density ?? 0.00042;
      this.restoreLighting();
    }
    // Chunky textures: switch every texture to "nearest" (no smoothing), and back.
    this.scene.traverse((o) => {
      const mats = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const t = m.map;
        if (!t) continue;
        if (on && !this.saved.has(t)) { this.saved.set(t, [t.magFilter, t.minFilter]); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.needsUpdate = true; }
        if (!on && this.saved.has(t)) { [t.magFilter, t.minFilter] = this.saved.get(t); t.needsUpdate = true; }
      }
    });
    if (!on) this.saved.clear();
  }

  /** Every frame while in 1997: keep the fog a moody purple. */
  update() {
    if (this.on) this.fog.color.setHex(0x3c2f63);
  }
}
