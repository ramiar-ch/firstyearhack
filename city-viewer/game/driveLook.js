const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const LOOK_IDLE = 1.25;

// Relative yaw remains free while coasting. With throttle, consume the car's
// rotation so the driver can steer toward the direction they dragged to.
export class DriveLook {
  constructor() { this.reset(); }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.idle = LOOK_IDLE;
    this.assisting = false;
  }

  drag(dx, dy) {
    if (!dx && !dy) return;
    this.yaw = clamp(this.yaw - dx * 0.006, -2.55, 2.55);
    this.pitch = clamp(this.pitch + dy * 0.004, -0.28, 0.56);
    this.idle = 0;
  }

  steer(dt, throttle, manual) {
    this.idle += dt;
    if (this.idle >= LOOK_IDLE) {
      const decay = Math.exp(-dt * 4.2);
      this.yaw *= decay;
      this.pitch *= decay;
    }
    this.assisting = throttle && !manual && this.idle < LOOK_IDLE && Math.abs(this.yaw) > 0.025;
    return this.assisting ? clamp(this.yaw * 1.3, -0.9, 0.9) : manual;
  }

  followTurn(delta) {
    if (this.assisting) this.yaw = clamp(this.yaw - delta, -2.55, 2.55);
  }
}
