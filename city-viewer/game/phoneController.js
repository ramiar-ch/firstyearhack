// game/phoneController.js - the game side of the phone controller.
//
//  - Listens for driving input sent by controller.html (via relay.js).
//  - Sends vibration patterns back to the phone (haptics).
//  - Shows a QR code (press P, or the 📱 button) that opens the controller
//    on a phone on the same Wi-Fi / hotspot.

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

// Vibration patterns (milliseconds: buzz, pause, buzz, ...).
export const HAPTICS = {
  crash: [120, 40, 120],
  pickup: [40],
  passed: [60, 60, 60, 60, 180],
  failed: [300],
  police: [200, 100, 200, 100, 200],
  warp: [20, 30, 20, 30, 20, 30, 400],
};

export class PhoneController {
  /** onAction: called when the phone's E button is pressed. */
  constructor(onAction) {
    this.onAction = onAction;
    this.input = null;
    this.lastInputTime = 0;
    this.lastAction = 0;
    this.phones = 0;

    try {
      const events = new EventSource('/api/events?role=game');
      events.addEventListener('input', (e) => {
        const d = JSON.parse(e.data);
        this.input = d;
        this.lastInputTime = performance.now();
        if (d.action && d.action !== this.lastAction) { this.lastAction = d.action; this.onAction(); }
      });
      events.addEventListener('phones', (e) => {
        this.phones = JSON.parse(e.data).count;
        this.button.textContent = this.phones ? `📱 Phone connected (${this.phones})` : '📱 Phone controller (P)';
        if (this.phones) this.hideQr();
      });
    } catch { /* opened as a file, not through serve.js - no phone support */ }

    this.button = document.createElement('button');
    this.button.id = 'phone-btn';
    this.button.textContent = '📱 Phone controller (P)';
    this.button.onclick = () => { this.toggleQr(); this.button.blur(); };
    document.body.appendChild(this.button);
  }

  /** The phone's controls, or null if no phone has sent anything recently. */
  getInput() {
    return this.input && performance.now() - this.lastInputTime < 1000 ? this.input : null;
  }

  /** Make the phone vibrate (pattern = one of HAPTICS). */
  haptic(pattern) {
    if (!this.phones) return;
    fetch('/api/haptic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pattern }) }).catch(() => {});
  }

  // ---- QR code overlay ------------------------------------------------------
  async toggleQr() {
    if (this.overlay) { this.hideQr(); return; }
    this.overlay = document.createElement('div');
    this.overlay.id = 'qr-overlay';
    this.overlay.innerHTML = '<div class="qr-card"><h2>Scan to drive</h2><div class="qr-img">Loading…</div><p class="qr-url"></p><p class="qr-tip">Phone and laptop must be on the same Wi-Fi (or the phone\'s hotspot). Press P to close.</p></div>';
    this.overlay.onclick = () => this.hideQr();
    document.body.appendChild(this.overlay);

    try {
      const info = await (await fetch('/api/info')).json();
      const ip = info.ips[0];
      if (!ip) throw new Error('no network');
      const url = `http://${ip}:${info.port}/controller.html`;
      this.overlay.querySelector('.qr-url').textContent = url;
      await loadScript(QR_LIB);
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      this.overlay.querySelector('.qr-img').innerHTML = qr.createImgTag(8, 16);
    } catch (err) {
      this.overlay.querySelector('.qr-img').textContent = 'Could not make the QR code: ' + err.message;
    }
  }

  hideQr() {
    if (this.overlay) { this.overlay.remove(); this.overlay = null; }
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.qrcode) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('QR library failed to load (offline?)'));
    document.head.appendChild(s);
  });
}
