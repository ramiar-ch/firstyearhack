// game/wanted.js - wanted level: 0 to 5 stars.
//   every crash        -> +1 star (max 5)
//   more stars         -> more police cars (1 per star, max 3) that drive faster
//   stay far away (120 m+ from every police car) for 10 s -> lose a star
//   phone box / roadblock / getting NICKED -> all stars gone

const MAX = 5;
const LOSE_DISTANCE = 120; // metres away from all police to start losing a star
const LOSE_TIME = 10; // seconds

export class WantedLevel {
  constructor() {
    this.level = 0;
    this.farTime = 0;
    this.el = document.createElement('div');
    this.el.id = 'wanted';
    document.body.appendChild(this.el);
    this.render();
  }

  add(n = 1) {
    this.level = Math.min(MAX, this.level + n);
    this.farTime = 0;
    this.render(true);
  }

  clear() {
    if (!this.level) return;
    this.level = 0;
    this.render();
  }

  /** How many police cars should be chasing. */
  get policeCars() {
    return Math.min(3, this.level);
  }

  /**
   * Call every frame with the distance to the NEAREST police car (Infinity if none).
   * Returns true when a star was lost this frame.
   */
  update(dt, nearestPolice) {
    if (!this.level) return false;
    if (nearestPolice > LOSE_DISTANCE) this.farTime += dt; else this.farTime = 0;
    this.el.style.setProperty('--fade', this.farTime > 0 ? String(1 - this.farTime / LOSE_TIME) : '1');
    if (this.farTime >= LOSE_TIME) {
      this.level--;
      this.farTime = 0;
      this.render();
      return true;
    }
    return false;
  }

  render(pop = false) {
    this.el.style.display = this.level ? 'flex' : 'none';
    this.el.innerHTML = '';
    for (let i = 0; i < MAX; i++) {
      const s = document.createElement('span');
      s.className = i < this.level ? 'on' : 'off';
      s.textContent = '★';
      this.el.appendChild(s);
    }
    if (pop) {
      this.el.classList.remove('pop');
      void this.el.offsetWidth; // restart the CSS animation
      this.el.classList.add('pop');
    }
  }
}
