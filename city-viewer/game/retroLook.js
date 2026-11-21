// game/retroLook.js - makes 1997 mode look like a real late-90s game, not just "pixelated":
//   - limited colour palette with dithering (the checkerboard dot shading old PCs used)
//   - thick purple fog = short draw distance (buildings "pop in" like on old consoles)
//   - chunky, sharp textures (no smooth blending)
//   - no modern glow or soft shadows
// (The low resolution + scanlines still come from game/timewarp.js.)

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Screen filter: squash colours to a few levels per channel, with a 4x4 Bayer
// dither pattern so gradients turn into the classic dotted look.
const PaletteShader = {
  uniforms: { tDiffuse: { value: null }, levels: { value: 5 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float levels; varying vec2 vUv;
    float bayer(vec2 p){
      int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
      float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      return m[i] / 16. - 0.5;
    }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = pow(c, vec3(0.9)) * 1.08;                       // a bit punchier, like old CRT colours
      c += bayer(gl_FragCoord.xy) / levels;               // dither
      c = floor(c * levels + 0.5) / levels;               // only a few shades per colour
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
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
