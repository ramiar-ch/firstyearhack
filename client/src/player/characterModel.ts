// characterModel.ts - a low-poly blocky person built from boxes.
//
// Made from a simple config object, so the players AND (later) NPCs can use it:
//   const model = new CharacterModel({ name: 'Sam', skin: 2, hair: 'bun', ... });
//   scene.add(model.root);
//   model.update(dt, speed, running);   // every frame, for the animations
//
// Built at real size (~1.8 m) - the game draws players 2x bigger (see SCALE)
// so they're readable from the high overhead camera.
// Forward = -z (same as everything else in the game).

import * as THREE from 'three';

// ---- Options (the character creator cycles through these lists) -------------
export const SKIN_TONES = ['#f5d6bd', '#e8b894', '#c98e62', '#a86b43', '#7a4a2b', '#4f2f1c'];
export const HAIR_STYLES = ['short', 'long', 'bun', 'bald'] as const;
export const HAIR_COLOURS = [
  { name: 'Black', value: '#1b1714' },
  { name: 'Brown', value: '#5a3825' },
  { name: 'Blonde', value: '#d9b45f' },
  { name: 'Ginger', value: '#b4542a' },
  { name: 'Grey', value: '#9c9a96' },
  { name: 'Blue', value: '#2f5fd0' },
];
export const HATS = ['none', 'beanie', 'cap', 'bucket'] as const;
export const JACKET_COLOURS = [
  { name: 'Orange', value: '#ff7a1a' },
  { name: 'Navy', value: '#1f3a7a' },
  { name: 'Black', value: '#1c1e24' },
  { name: 'Red', value: '#c0282d' },
  { name: 'Mustard', value: '#d8a020' },
  { name: 'Forest', value: '#2f5a36' },
  { name: 'Royal blue', value: '#2a5bd7' },
  { name: 'White', value: '#e8e6e0' },
];
export const TROUSER_COLOURS = [
  { name: 'Denim', value: '#3a5272' },
  { name: 'Black', value: '#18191d' },
  { name: 'Khaki', value: '#8a7a55' },
  { name: 'Grey', value: '#5c5f66' },
  { name: 'Navy', value: '#1c2a4a' },
  { name: 'Brown', value: '#5a4030' },
];

export type HairStyle = (typeof HAIR_STYLES)[number];
export type Hat = (typeof HATS)[number];

export interface CharacterConfig {
  name: string;
  skin: number; // index into SKIN_TONES
  hair: HairStyle;
  hairColour: string; // '#rrggbb'
  hat: Hat;
  jacket: string; // '#rrggbb'
  trousers: string; // '#rrggbb'
  backpack: boolean; // delivery backpack
}

export const SCALE = 2; // players are drawn 2x real size (readable from above)
export const P1_COLOUR = 0xff8c1a; // orange
export const P2_COLOUR = 0x3a8bff; // blue

/** A sensible starting look for player 1 / player 2. */
export function defaultConfig(player: 1 | 2): CharacterConfig {
  return player === 1
    ? { name: 'Player 1', skin: 1, hair: 'short', hairColour: '#5a3825', hat: 'cap',
        jacket: '#ff7a1a', trousers: '#3a5272', backpack: true }
    : { name: 'Player 2', skin: 3, hair: 'bun', hairColour: '#1b1714', hat: 'none',
        jacket: '#2a5bd7', trousers: '#18191d', backpack: false };
}

/** A random look (for the 🎲 button, and NPCs later). */
export function randomConfig(name = 'Londoner', rand: () => number = Math.random): CharacterConfig {
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  return {
    name,
    skin: Math.floor(rand() * SKIN_TONES.length),
    hair: pick(HAIR_STYLES),
    hairColour: pick(HAIR_COLOURS).value,
    hat: rand() < 0.4 ? 'none' : pick(HATS),
    jacket: pick(JACKET_COLOURS).value,
    trousers: pick(TROUSER_COLOURS).value,
    backpack: rand() < 0.3,
  };
}

// ---- Shared geometry/material caches (lots of people = reuse, don't copy) ----
const boxCache = new Map<string, THREE.BoxGeometry>();
function boxGeo(w: number, h: number, d: number) {
  const key = `${w},${h},${d}`;
  if (!boxCache.has(key)) boxCache.set(key, new THREE.BoxGeometry(w, h, d));
  return boxCache.get(key)!;
}
const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(colour: string) {
  if (!matCache.has(colour)) {
    matCache.set(colour, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.75, flatShading: true }));
  }
  return matCache.get(colour)!;
}

/** A box mesh of size w x h x d, centred at (x, y, z), added to `parent`. */
function box(parent: THREE.Object3D, w: number, h: number, d: number, colour: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat(colour));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ---- The model ----------------------------------------------------------------
export class CharacterModel {
  /** Add this to the scene. Move/rotate THIS (position = feet on the ground). */
  readonly root = new THREE.Group();
  config: CharacterConfig;

  private body = new THREE.Group(); // everything that bobs/hops (not the ring)
  private leftLeg = new THREE.Group(); // pivots at the hips
  private rightLeg = new THREE.Group();
  private leftArm = new THREE.Group(); // pivots at the shoulders
  private rightArm = new THREE.Group();
  private ring: THREE.Mesh | null = null;

  private phase = 0; // walk cycle position (radians)
  private time = 0;
  private hopTime = 0; // > 0 while doing the "jump into car" hop

  /** ringColour: glowing ring under the feet (players only - leave out for NPCs). */
  constructor(config: CharacterConfig, ringColour?: number, scale = SCALE) {
    this.config = config;
    this.root.scale.setScalar(scale);
    this.root.add(this.body);
    this.build();
    if (ringColour !== undefined) this.addRing(ringColour);
  }

  /** Change the look (rebuilds the boxes, keeps position/animation). */
  setConfig(config: CharacterConfig) {
    this.config = config;
    this.body.clear();
    for (const g of [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]) g.clear();
    this.build();
  }

  private build() {
    const c = this.config;
    const skin = SKIN_TONES[c.skin] ?? SKIN_TONES[0];
    const shoe = '#141414';

    // Legs: trousers + shoes, hanging down from a pivot at hip height.
    for (const [leg, x] of [[this.leftLeg, -0.12], [this.rightLeg, 0.12]] as const) {
      leg.position.set(x, 0.86, 0);
      box(leg, 0.18, 0.74, 0.2, c.trousers, 0, -0.37, 0);
      box(leg, 0.19, 0.1, 0.28, shoe, 0, -0.8, -0.04); // shoe sticks out at the front
      this.body.add(leg);
    }

    // Torso (jacket) with a darker belt line.
    box(this.body, 0.48, 0.58, 0.27, c.jacket, 0, 1.15, 0);
    box(this.body, 0.49, 0.06, 0.28, '#222222', 0, 0.88, 0);

    // Arms: sleeves + hands, hanging from shoulder pivots.
    for (const [arm, x] of [[this.leftArm, -0.32], [this.rightArm, 0.32]] as const) {
      arm.position.set(x, 1.4, 0);
      box(arm, 0.14, 0.52, 0.16, c.jacket, 0, -0.26, 0);
      box(arm, 0.12, 0.12, 0.13, skin, 0, -0.58, 0);
      this.body.add(arm);
    }

    // Head with eyes (on the front = -z side).
    const head = new THREE.Group();
    head.position.set(0, 1.63, 0);
    this.body.add(head);
    box(head, 0.32, 0.32, 0.3, skin);
    box(head, 0.05, 0.05, 0.02, '#111111', -0.07, 0.02, -0.155);
    box(head, 0.05, 0.05, 0.02, '#111111', 0.07, 0.02, -0.155);

    // Hair.
    const hc = c.hairColour;
    if (c.hair !== 'bald') {
      box(head, 0.34, 0.08, 0.32, hc, 0, 0.19, 0); // top
      box(head, 0.34, 0.2, 0.06, hc, 0, 0.08, 0.14); // back
    }
    if (c.hair === 'long') box(head, 0.34, 0.42, 0.07, hc, 0, -0.12, 0.15); // down to the shoulders
    if (c.hair === 'bun') box(head, 0.14, 0.14, 0.14, hc, 0, 0.27, 0.1);

    // Hats (sit on top of the hair).
    if (c.hat === 'beanie') {
      box(head, 0.35, 0.14, 0.34, '#2b2f3a', 0, 0.24, 0);
      box(head, 0.36, 0.05, 0.35, '#3b4150', 0, 0.16, 0); // folded band
    } else if (c.hat === 'cap') {
      box(head, 0.35, 0.1, 0.34, '#1c1e24', 0, 0.22, 0);
      box(head, 0.28, 0.03, 0.18, '#1c1e24', 0, 0.18, -0.24); // brim at the front
    } else if (c.hat === 'bucket') {
      box(head, 0.32, 0.13, 0.32, '#c8b98f', 0, 0.25, 0);
      box(head, 0.46, 0.03, 0.46, '#c8b98f', 0, 0.18, 0); // wide floppy brim
    }

    // Delivery backpack: a big insulated box on the back (+z).
    if (c.backpack) {
      box(this.body, 0.42, 0.46, 0.3, '#ffb21a', 0, 1.2, 0.3);
      box(this.body, 0.43, 0.08, 0.31, '#1c1e24', 0, 1.3, 0.3); // dark stripe
    }
  }

  private addRing(colour: number) {
    // A soft glowing ring on the ground: a flat ring that fades outwards.
    const geo = new THREE.RingGeometry(0.42, 0.62, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // adds light = glows on dark ground
    });
    this.ring = new THREE.Mesh(geo, material);
    this.ring.position.y = 0.03;
    this.root.add(this.ring);
  }

  /** Little jump + spin, played when getting into a car. */
  playHop() {
    this.hopTime = HOP_DURATION;
  }

  get hopping() {
    return this.hopTime > 0;
  }

  /**
   * Animate. speed = metres per second (0 = idle), running = Shift held.
   * Walk/run swing arms and legs; idle bobs gently.
   */
  update(dt: number, speed: number, running = false) {
    this.time += dt;
    const moving = speed > 0.2;

    if (moving) {
      // Legs move faster and further when running.
      this.phase += dt * speed * (running ? 1.1 : 1.6);
      const swing = running ? 0.95 : 0.6;
      const s = Math.sin(this.phase) * swing;
      this.leftLeg.rotation.x = s;
      this.rightLeg.rotation.x = -s;
      this.leftArm.rotation.x = -s * 0.9; // arms opposite to legs
      this.rightArm.rotation.x = s * 0.9;
      // Small bounce on each step, and lean forward when running.
      this.body.position.y = Math.abs(Math.sin(this.phase)) * (running ? 0.08 : 0.04);
      this.body.rotation.x = running ? -0.12 : -0.03;
    } else {
      // Idle: relax the limbs back to straight, gentle breathing bob.
      const relax = 1 - Math.exp(-10 * dt);
      for (const g of [this.leftLeg, this.rightLeg, this.leftArm, this.rightArm]) {
        g.rotation.x += (0 - g.rotation.x) * relax;
      }
      this.leftArm.rotation.z = -0.04;
      this.rightArm.rotation.z = 0.04;
      this.body.position.y = Math.sin(this.time * 2.2) * 0.015;
      this.body.rotation.x += (0 - this.body.rotation.x) * relax;
    }

    // Hop into the car: up and down once while spinning half a turn.
    if (this.hopTime > 0) {
      this.hopTime = Math.max(0, this.hopTime - dt);
      const t = 1 - this.hopTime / HOP_DURATION; // 0 -> 1
      this.body.position.y = Math.sin(t * Math.PI) * 0.45;
      this.body.rotation.y = t * Math.PI;
      this.leftArm.rotation.x = this.rightArm.rotation.x = 2.6 * Math.sin(t * Math.PI); // arms up!
    } else {
      this.body.rotation.y = 0;
    }

    // The ring gently pulses so your eye catches it.
    if (this.ring) {
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.time * 3) * 0.2;
    }
  }
}

const HOP_DURATION = 0.4; // seconds
