/** Per-player input: keyboard fallback, gamepads, and debug bots. */

const DEAD = 0.15;

export class InputState {
  constructor() {
    this.reset();
  }
  reset() {
    this.moveX = 0;
    this.moveY = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.jog = 0;
    this.jumpPressed = false;
    this.toggleView = false;
    this.camDist = 0;
    this.pausePressed = false;
    this.leaveHeld = false;
    this.joinPressed = false;
    this.connected = false;
  }
}

function applyDead(v, dz = DEAD) {
  return Math.abs(v) < dz ? 0 : v;
}
function squareAxis(v) {
  const a = applyDead(v);
  return a * Math.abs(a);
}

export class KeyboardMouseSource {
  constructor() {
    this.keys = Object.create(null);
    this.jumpSeq = 0;
    this.toggleViewSeq = 0;
    this._lastJumpSeq = 0;
    this._lastToggleSeq = 0;
    this._lookYaw = 0;
    this._lookPitch = 0;
    this.dragging = false;
    this._bound = false;
    this.kind = 'keyboard';
    this.lookSens = 1;
    this.invertY = false;
  }

  bind(domElement, getMode) {
    if (this._bound) return;
    this._bound = true;
    this.getMode = getMode;
    this.el = domElement;

    addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.jumpSeq++;
      }
      if (e.code === 'KeyV' && !e.repeat) this.toggleViewSeq++;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    addEventListener('blur', () => this.reset());
    this.el.addEventListener('mousedown', () => {
      const m = this.getMode();
      if (m === 'walk' || m === 'fly') {
        this.dragging = true;
        if (!document.pointerLockElement) {
          try {
            const p = this.el.requestPointerLock();
            if (p && p.catch) p.catch(() => {});
          } catch (_) {}
        }
      }
    });
    addEventListener('mouseup', () => {
      this.dragging = false;
    });
    addEventListener('mousemove', (e) => {
      const m = this.getMode();
      if (m !== 'walk' && m !== 'fly') return;
      if (document.pointerLockElement === this.el || this.dragging) {
        const s = 0.0022 * (this.lookSens || 1);
        this._lookYaw -= e.movementX * s;
        this._lookPitch -= e.movementY * s * (this.invertY ? -1 : 1);
      }
    });
  }

  key(code) {
    return !!this.keys[code];
  }

  _axes() {
    const f =
      (this.key('KeyW') || this.key('ArrowUp') ? 1 : 0) -
      (this.key('KeyS') || this.key('ArrowDown') ? 1 : 0);
    const r =
      (this.key('KeyD') || this.key('ArrowRight') ? 1 : 0) -
      (this.key('KeyA') || this.key('ArrowLeft') ? 1 : 0);
    return { f, r };
  }

  poll(input) {
    input.reset();
    input.connected = true;
    const { f, r } = this._axes();
    input.moveY = f;
    input.moveX = r;
    input.jog = this.key('ShiftLeft') || this.key('ShiftRight') ? 1 : 0;
    input.lookYaw = this._lookYaw;
    input.lookPitch = this._lookPitch;
    this._lookYaw = 0;
    this._lookPitch = 0;
    input.camDist =
      (this.key('BracketRight') || this.key('Equal') ? 1 : 0) -
      (this.key('BracketLeft') || this.key('Minus') ? 1 : 0);
    if (this.jumpSeq !== this._lastJumpSeq) {
      input.jumpPressed = true;
      this._lastJumpSeq = this.jumpSeq;
    }
    if (this.toggleViewSeq !== this._lastToggleSeq) {
      input.toggleView = true;
      this._lastToggleSeq = this.toggleViewSeq;
    }
  }

  reset() {
    for (const k in this.keys) this.keys[k] = false;
    this.dragging = false;
    this._lookYaw = 0;
    this._lookPitch = 0;
  }
}

/** Standard Gamepad API source (one pad index). */
export class GamepadSource {
  constructor(index) {
    this.index = index;
    this.kind = 'gamepad';
    this.jumpSeq = 0;
    this.toggleViewSeq = 0;
    this.pauseSeq = 0;
    this._lastJump = 0;
    this._lastToggle = 0;
    this._lastPause = 0;
    this._prevA = false;
    this._prevY = false;
    this._prevStart = false;
    this._startHeld = 0;
    this.warnedMapping = false;
    this.padId = null;
  }

  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[this.index] || null;
  }

  poll(input, dt = 0.016) {
    input.reset();
    const gp = this._pad();
    if (!gp || !gp.connected) {
      input.connected = false;
      return;
    }
    input.connected = true;
    this.padId = gp.id;

    if (gp.mapping !== 'standard' && !this.warnedMapping) {
      this.warnedMapping = true;
      input._warnMapping = true;
    }

    const ax = gp.axes || [];
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const bval = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);

    // Left stick: move (Y flipped: up = positive moveY)
    input.moveX = applyDead(ax[0] || 0);
    input.moveY = -applyDead(ax[1] || 0);

    // Right stick: look, squared response
    const lx = squareAxis(ax[2] || 0);
    const ly = squareAxis(ax[3] || 0);
    input.lookYaw = -lx * 2.8 * dt;
    input.lookPitch = -ly * 1.8 * dt; // stick down → pitch down → elev up

    // A=0 jump, Y=3 toggle, LB=4 / L3=10 jog, Start=9
    const a = btn(0);
    const y = btn(3);
    const start = btn(9);
    input.jog = btn(4) || btn(10) ? 1 : 0;

    // D-pad: 12 up, 13 down → camera distance
    input.camDist = (btn(12) ? 1 : 0) - (btn(13) ? 1 : 0);

    if (a && !this._prevA) this.jumpSeq++;
    if (y && !this._prevY) this.toggleViewSeq++;
    this._prevA = a;
    this._prevY = y;

    if (start) {
      this._startHeld += dt;
      input.leaveHeld = this._startHeld >= 1;
    } else {
      // Tap Start (<1s) = pause; release after hold-to-leave does not pause
      if (this._prevStart && this._startHeld > 0 && this._startHeld < 1) this.pauseSeq++;
      this._startHeld = 0;
      input.leaveHeld = false;
    }
    this._prevStart = start;

    if (this.jumpSeq !== this._lastJump) {
      input.jumpPressed = true;
      this._lastJump = this.jumpSeq;
    }
    if (this.toggleViewSeq !== this._lastToggle) {
      input.toggleView = true;
      this._lastToggle = this.toggleViewSeq;
    }
    if (this.pauseSeq !== this._lastPause) {
      input.pausePressed = true;
      this._lastPause = this.pauseSeq;
    }
  }

  /** True for one poll when A is newly pressed (join / reattach). */
  consumeJoin() {
    const gp = this._pad();
    if (!gp || !gp.connected) return false;
    const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
    const edge = a && !this._prevA;
    // Don't advance _prevA here — poll() owns that; peek via separate tracker
    return edge;
  }

  reset() {
    this._startHeld = 0;
  }
}

/** Scan pads; return join events for unclaimed indices. */
export function pollGamepadJoins(claimedIndices, sourcesByIndex) {
  const joins = [];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < pads.length; i++) {
    const gp = pads[i];
    if (!gp || !gp.connected) continue;
    const a = !!(gp.buttons[0] && gp.buttons[0].pressed);
    let src = sourcesByIndex.get(i);
    if (!src) {
      src = new GamepadSource(i);
      sourcesByIndex.set(i, src);
    }
    // Edge detect join on unclaimed pads
    if (!claimedIndices.has(i)) {
      if (a && !src._joinPrevA) joins.push({ index: i, source: src });
    }
    src._joinPrevA = a;
  }
  return joins;
}

/** Debug bot that walks PEDG via InputState. */
export class BotSource {
  constructor() {
    this.kind = 'bot';
    this.e = null;
    this.fwd = true;
    this.s = 0;
    this.targetYaw = 0;
    this._o = { x: 0, z: 0, tx: 0, tz: 0 };
  }

  poll(input, dt, ctx) {
    input.reset();
    input.connected = true;
    if (!ctx || !ctx.PEDG || !ctx.edgeAt || !ctx.nextEdge) return;

    if (!this.e) {
      const edges = ctx.PEDG.edges;
      if (!edges.length) return;
      this.e = edges[(Math.random() * edges.length) | 0];
      this.s = Math.random() * this.e.len;
      this.fwd = Math.random() < 0.5;
    }

    const speed = 1.35;
    this.s += speed * dt;
    if (this.s >= this.e.len) {
      const node = this.fwd ? this.e.b : this.e.a;
      const n = ctx.nextEdge(ctx.PEDG, node, this.e);
      if (n) {
        this.s = 0;
        this.e = n.e;
        this.fwd = n.fwd;
      } else {
        this.fwd = !this.fwd;
        this.s = 0;
      }
    }
    ctx.edgeAt(this.e, this.fwd ? this.s : this.e.len - this.s, this._o);
    let tx = this._o.tx;
    let tz = this._o.tz;
    if (!this.fwd) {
      tx = -tx;
      tz = -tz;
    }
    // Face travel direction; bot fills wish relative to player yaw later —
    // instead drive world-ish by setting look toward path and move forward.
    this.targetYaw = Math.atan2(-tx, -tz);
    this.goalX = this._o.x;
    this.goalZ = this._o.z;
    // Caller uses steerBot(player, this, input)
    input.moveY = 1;
    input.jog = 0;
  }

  reset() {}
}

/** Steer a bot player toward BotSource goal by filling look + move. */
export function fillBotInput(p, bot, input, dt) {
  bot.poll(input, dt, bot._ctx);
  if (bot.goalX == null) return;
  const dx = bot.goalX - p.pos.x;
  const dz = bot.goalZ - p.pos.z;
  const want = Math.atan2(-dx, -dz);
  let dy = want - p.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  input.lookYaw = Math.max(-2.8 * dt, Math.min(2.8 * dt, dy));
  input.lookPitch = 0;
  // Move forward if roughly facing the goal
  input.moveY = Math.abs(dy) < 0.6 ? 1 : 0.35;
  input.moveX = 0;
  input.connected = true;
}

let _ctx = null;
export function init(ctx) {
  _ctx = ctx;
}
export function getInputCtx() {
  return _ctx;
}
