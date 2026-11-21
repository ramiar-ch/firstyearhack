// characterCreator.ts - the "choose your character" screen shown before the game.
//
// Left half = Player 1, right half = Player 2 (same as the split-screen later).
// Each half has a name box, a rotating 3D preview on a turntable, and option
// rows (skin, hair, hats, colours...). Keyboard:
//   P1: W/S pick a row, A/D change it, E = READY
//   P2: arrows pick/change,             Enter = READY
// When both are READY (or someone clicks START) we call onStart(configs).
//
// The 3D previews are drawn on the SAME canvas as the London background:
// we render each preview into the rectangle of its HTML "window" using
// renderer.setViewport/setScissor (the same trick split-screen will use).

import * as THREE from 'three';
import {
  CharacterModel, defaultConfig, randomConfig,
  SKIN_TONES, HAIR_STYLES, HAIR_COLOURS, HATS, JACKET_COLOURS, TROUSER_COLOURS,
  P1_COLOUR, P2_COLOUR, type CharacterConfig,
} from '../player/characterModel';

const STORAGE_KEY = 'strand.characters.v1';
const NAME_MAX = 12;

// ---- Option rows ------------------------------------------------------------
// Each row knows how to show its current value and how to step to the next one.
interface OptionRow {
  label: string;
  show(c: CharacterConfig): { text: string; swatch?: string };
  step(c: CharacterConfig, dir: number): void; // dir = +1 or -1
}

/** Step through a list, wrapping around at the ends. */
function cycle<T>(list: readonly T[], current: T, dir: number): T {
  const i = Math.max(0, list.indexOf(current));
  return list[(i + dir + list.length) % list.length];
}
const nameOf = (list: { name: string; value: string }[], value: string) =>
  list.find((o) => o.value === value)?.name ?? '?';
const values = (list: { value: string }[]) => list.map((o) => o.value);
const title = (s: string) => s[0].toUpperCase() + s.slice(1);

const ROWS: OptionRow[] = [
  {
    label: 'Skin',
    show: (c) => ({ text: `Tone ${c.skin + 1}`, swatch: SKIN_TONES[c.skin] }),
    step: (c, d) => { c.skin = (c.skin + d + SKIN_TONES.length) % SKIN_TONES.length; },
  },
  {
    label: 'Hair',
    show: (c) => ({ text: title(c.hair) }),
    step: (c, d) => { c.hair = cycle(HAIR_STYLES, c.hair, d); },
  },
  {
    label: 'Hair colour',
    show: (c) => ({ text: nameOf(HAIR_COLOURS, c.hairColour), swatch: c.hairColour }),
    step: (c, d) => { c.hairColour = cycle(values(HAIR_COLOURS), c.hairColour, d); },
  },
  {
    label: 'Hat',
    show: (c) => ({ text: c.hat === 'none' ? 'None' : c.hat === 'bucket' ? 'Bucket hat' : title(c.hat) }),
    step: (c, d) => { c.hat = cycle(HATS, c.hat, d); },
  },
  {
    label: 'Jacket',
    show: (c) => ({ text: nameOf(JACKET_COLOURS, c.jacket), swatch: c.jacket }),
    step: (c, d) => { c.jacket = cycle(values(JACKET_COLOURS), c.jacket, d); },
  },
  {
    label: 'Trousers',
    show: (c) => ({ text: nameOf(TROUSER_COLOURS, c.trousers), swatch: c.trousers }),
    step: (c, d) => { c.trousers = cycle(values(TROUSER_COLOURS), c.trousers, d); },
  },
  {
    label: 'Backpack',
    show: (c) => ({ text: c.backpack ? 'Delivery bag' : 'None' }),
    step: (c) => { c.backpack = !c.backpack; },
  },
];

// Keys for each side of the screen.
const SIDE_KEYS = {
  1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', ready: 'KeyE', readyLabel: 'E' },
  2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', ready: 'Enter', readyLabel: 'Enter' },
} as const;

// ---- Saving the last choices --------------------------------------------------
// localStorage can be blocked (private mode etc.), so every access is wrapped.
function loadSaved(): [CharacterConfig, CharacterConfig] {
  const defaults: [CharacterConfig, CharacterConfig] = [defaultConfig(1), defaultConfig(2)];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length === 2) {
      // Merge onto the defaults so missing/old fields still work.
      return [{ ...defaults[0], ...saved[0] }, { ...defaults[1], ...saved[1] }];
    }
  } catch {
    /* storage blocked or broken JSON: just use the defaults */
  }
  return defaults;
}

function save(configs: CharacterConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch {
    /* storage blocked: choices just won't be remembered */
  }
}

// ---- One half of the screen ----------------------------------------------------
class CreatorSide {
  readonly index: 1 | 2;
  config: CharacterConfig;
  ready = false;
  selectedRow = 0;

  readonly el: HTMLElement; // the panel
  readonly previewEl: HTMLElement; // the "window" the 3D preview is drawn into
  private rowEls: HTMLElement[] = [];
  private readyBtn: HTMLButtonElement;
  private nameInput: HTMLInputElement;

  // The 3D preview: its own little scene with a turntable and lights.
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private model: CharacterModel;
  private turntable = new THREE.Group();

  constructor(index: 1 | 2, config: CharacterConfig, onChange: () => void) {
    this.index = index;
    this.config = config;
    const colour = index === 1 ? P1_COLOUR : P2_COLOUR;
    const keys = SIDE_KEYS[index];

    // ---- HTML ----
    this.el = document.createElement('section');
    this.el.className = `creator-side p${index}`;
    this.el.innerHTML = `
      <header class="side-header">
        <span class="side-tag">PLAYER ${index}</span>
        <span class="side-keys">${index === 1 ? 'W/S choose · A/D change' : '↑/↓ choose · ←/→ change'}</span>
      </header>
      <input class="name-input" maxlength="${NAME_MAX}" spellcheck="false" aria-label="Player ${index} name" />
      <div class="preview"></div>
      <div class="options"></div>
      <div class="side-buttons">
        <button class="random-btn" type="button">🎲 Random</button>
        <button class="ready-btn" type="button"></button>
      </div>`;
    this.previewEl = this.el.querySelector('.preview')!;
    this.readyBtn = this.el.querySelector('.ready-btn')!;
    this.nameInput = this.el.querySelector('.name-input')!;
    this.nameInput.value = config.name;
    // Clicking the box selects the old name, so typing replaces it.
    this.nameInput.addEventListener('focus', () => this.nameInput.select());
    this.nameInput.addEventListener('input', () => {
      this.config.name = this.nameInput.value.slice(0, NAME_MAX);
      onChange();
    });

    const options = this.el.querySelector('.options')!;
    ROWS.forEach((row, i) => {
      const r = document.createElement('div');
      r.className = 'option-row';
      r.innerHTML = `
        <span class="opt-label"></span>
        <button class="arrow" type="button" aria-label="Previous">‹</button>
        <span class="opt-value"><i class="swatch"></i><span class="opt-text"></span></span>
        <button class="arrow" type="button" aria-label="Next">›</button>`;
      r.querySelector('.opt-label')!.textContent = row.label;
      const [prev, next] = r.querySelectorAll('button');
      prev.addEventListener('click', () => { this.selectedRow = i; this.change(-1); onChange(); });
      next.addEventListener('click', () => { this.selectedRow = i; this.change(1); onChange(); });
      r.addEventListener('mouseenter', () => { this.selectedRow = i; this.refresh(); });
      options.appendChild(r);
      this.rowEls.push(r);
    });

    this.el.querySelector('.random-btn')!.addEventListener('click', () => { this.randomise(); onChange(); });
    this.readyBtn.addEventListener('click', () => { this.toggleReady(); onChange(); });
    this.readyBtn.dataset.key = keys.readyLabel;

    // ---- 3D preview ----
    this.model = new CharacterModel(config, colour, 1); // real size in the preview
    this.model.root.position.y = 0.16; // stand on the turntable
    this.turntable.add(this.model.root);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1, 0.16, 48),
      new THREE.MeshStandardMaterial({ color: 0x141a2a, roughness: 0.4, metalness: 0.5 }),
    );
    disc.position.y = 0.08;
    const glowEdge = new THREE.Mesh(
      new THREE.TorusGeometry(0.97, 0.025, 8, 64).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: colour }),
    );
    glowEdge.position.y = 0.12;
    this.turntable.add(disc, glowEdge);
    this.scene.add(this.turntable);

    // "Nice lighting": soft fill + warm key from the front + coloured rim from behind.
    this.scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x1a1410, 1.2));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.4);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(colour, 3);
    rim.position.set(2, 2.5, -3);
    this.scene.add(key, rim);

    this.camera.position.set(0, 1.35, 4);
    this.camera.lookAt(0, 1, 0);
    this.refresh();
  }

  change(dir: number) {
    ROWS[this.selectedRow].step(this.config, dir);
    this.model.setConfig(this.config);
    this.refresh();
  }

  moveSelection(dir: number) {
    this.selectedRow = (this.selectedRow + dir + ROWS.length) % ROWS.length;
    this.refresh();
  }

  randomise() {
    this.config = randomConfig(this.config.name);
    this.model.setConfig(this.config);
    this.refresh();
  }

  toggleReady() {
    this.ready = !this.ready;
    this.refresh();
  }

  /** Update all the text on this side to match the config. */
  refresh() {
    ROWS.forEach((row, i) => {
      const { text, swatch } = row.show(this.config);
      const el = this.rowEls[i];
      el.classList.toggle('selected', i === this.selectedRow);
      el.querySelector('.opt-text')!.textContent = text;
      const sw = el.querySelector<HTMLElement>('.swatch')!;
      sw.style.display = swatch ? 'inline-block' : 'none';
      if (swatch) sw.style.background = swatch;
    });
    this.el.classList.toggle('is-ready', this.ready);
    this.readyBtn.textContent = this.ready ? '✓ READY' : `READY (${this.readyBtn.dataset.key ?? ''})`;
  }

  /** Spin the turntable and animate the idle character. */
  update(dt: number) {
    this.turntable.rotation.y += dt * 0.7;
    this.model.update(dt, 0);
  }
}

// ---- The whole screen -------------------------------------------------------------
export interface CharacterCreator {
  /** Call every frame AFTER rendering the background: draws the 3D previews. */
  update(dt: number, renderer: THREE.WebGLRenderer): void;
}

export function showCharacterCreator(
  onStart: (configs: [CharacterConfig, CharacterConfig]) => void,
): CharacterCreator {
  const [c1, c2] = loadSaved();
  const root = document.createElement('div');
  root.id = 'creator';
  root.innerHTML = `
    <h1 class="game-title"><span>STRAND</span> <span>THEFT</span> <span>AUTO</span></h1>
    <p class="game-subtitle">Choose your Londoners</p>
    <div class="creator-halves"></div>
    <footer class="creator-footer">
      <button class="start-btn" type="button">START ▸</button>
      <span class="start-hint">Both players press READY (P1: E · P2: Enter) or click START</span>
    </footer>`;
  document.body.appendChild(root);

  let started = false;
  const sides: CreatorSide[] = [];
  const configs = () => sides.map((s) => s.config) as [CharacterConfig, CharacterConfig];

  // Something changed: remember it, and start if both are ready.
  const onChange = () => {
    save(configs());
    if (sides.length === 2 && sides.every((s) => s.ready)) start();
  };

  sides.push(new CreatorSide(1, c1, onChange), new CreatorSide(2, c2, onChange));
  const halves = root.querySelector('.creator-halves')!;
  for (const s of sides) halves.appendChild(s.el);
  root.querySelector('.start-btn')!.addEventListener('click', () => start());

  function start() {
    if (started) return;
    started = true;
    // Empty names become "Player 1" / "Player 2".
    for (const s of sides) s.config.name = s.config.name.trim() || `Player ${s.index}`;
    save(configs());
    window.removeEventListener('keydown', onKey);
    root.remove();
    onStart(configs());
  }

  // ---- Keyboard ----
  function onKey(e: KeyboardEvent) {
    // While typing a name, keys type letters (Enter/Escape just leave the box).
    if (e.target instanceof HTMLInputElement) {
      if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.repeat && (e.code === 'KeyE' || e.code === 'Enter')) return;
    for (const side of sides) {
      const k = SIDE_KEYS[side.index];
      let handled = true;
      if (e.code === k.up) side.moveSelection(-1);
      else if (e.code === k.down) side.moveSelection(1);
      else if (e.code === k.left) side.change(-1);
      else if (e.code === k.right) side.change(1);
      else if (e.code === k.ready) side.toggleReady();
      else handled = false;
      if (handled) {
        e.preventDefault(); // stop arrow keys scrolling the page
        onChange();
      }
    }
  }
  window.addEventListener('keydown', onKey);

  return {
    update(dt, renderer) {
      if (started) return;
      // Draw each preview into its HTML window's rectangle on the canvas.
      // autoClear off = don't wipe the London background we just drew.
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      for (const side of sides) {
        side.update(dt);
        const r = side.previewEl.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const y = window.innerHeight - r.bottom; // WebGL measures from the BOTTOM
        renderer.setViewport(r.left, y, r.width, r.height);
        renderer.setScissor(r.left, y, r.width, r.height);
        side.camera.aspect = r.width / r.height;
        side.camera.updateProjectionMatrix();
        renderer.clearDepth(); // keep the London background, draw the character on top
        renderer.render(side.scene, side.camera);
      }
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
      renderer.autoClear = autoClear;
    },
  };
}
