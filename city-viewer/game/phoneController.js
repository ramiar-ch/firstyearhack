// game/phoneController.js - the game side of the phone controller.
//
//  - Listens for driving input sent by controller.html (via relay.js).
//  - Sends vibration patterns back to the phone (haptics).
//  - Shows separate P1 and P2 codes in Settings for phones on the same network.

const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

// Vibration patterns (milliseconds: buzz, pause, buzz, ...).
export const HAPTICS = {
  crash: [120, 40, 120],
  pickup: [40],
  passed: [60, 60, 60, 60, 180],
  failed: [300],
  police: [200, 100, 200, 100, 200],
  warp: [20, 30, 20, 30, 20, 30, 400],
  throw: [30, 20, 60],
  thud: [250],
  nicked: [400, 100, 400],
  policeNear: [50],
};

export class PhoneController {
  constructor(panel, translate) {
    this.translate = translate;
    this.room = Array.from(crypto.getRandomValues(new Uint8Array(12)), n => n.toString(16).padStart(2, '0')).join('');
    this.slots = [0, 1].map(() => ({ input: null, inputTime: 0, lastAction: null, lastThrow: null }));
    this.connected = new Set();
    this.onPhonesChange = () => {};
    this.onAction = () => {};
    this.onThrow = () => {};
    this.onScan = () => {};
    this.panel = panel;
    this.network = panel.querySelector('.qr-network');
    this.cards = [...panel.querySelectorAll('.qr-player')];

    this.events = new EventSource('/api/events?' + new URLSearchParams({ role: 'game', room: this.room }));
    this.events.addEventListener('input', e => {
      const input = JSON.parse(e.data), who = input.player - 1;
      const slot = this.slots[who];
      if (!slot) return;
      slot.input = input;
      slot.inputTime = performance.now();
      if (input.action && input.action !== slot.lastAction) {
        slot.lastAction = input.action;
        this.onAction(who);
      }
      if (input.throw && input.throw !== slot.lastThrow) {
        slot.lastThrow = input.throw;
        this.onThrow(who);
      }
    });
    this.events.addEventListener('scan', e => {
      const {player, image, cut} = JSON.parse(e.data);
      this.onScan(player - 1, image, cut);
    });
    this.events.addEventListener('phones', e => {
      this.connected = new Set(JSON.parse(e.data).slots.map(player => player - 1));
      this.slots.forEach((slot, who) => { if (!this.connected.has(who)) slot.input = null; });
      this.renderStatus();
      this.onPhonesChange(this.connected);
    });
    this.events.onerror = () => {
      this.connected.clear();
      this.clearInput();
      this.renderStatus();
    };
    this.renderStatus();
  }

  hasPlayer(who) { return this.connected.has(who); }

  getInput(who) {
    const slot = this.slots[who];
    return this.hasPlayer(who) && slot.input && performance.now() - slot.inputTime < 1000 ? slot.input : null;
  }

  clearInput() {
    for (const slot of this.slots) slot.input = null;
  }

  send(endpoint, data) {
    if (!this.connected.size) return;
    fetch('/api/' + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: this.room, ...data }) }).catch(() => {});
  }

  haptic(pattern, who) {
    if (pattern) this.send('haptic', { player: who == null ? undefined : who + 1, pattern });
  }

  message(text, pager) {
    this.send('phone-message', { text, pager });
  }

  renderStatus() {
    this.cards.forEach((card, who) => {
      card.querySelector('.qr-status').textContent = this.translate(this.hasPlayer(who) ? 'phoneConnected' : 'phoneWaiting');
    });
  }

  async renderCodes() {
    this.renderStatus();
    if (this.loading || this.ready) return;
    this.loading = true;
    this.network.textContent = this.translate('phoneLoading');
    try {
      const response = await fetch('/api/info');
      if (!response.ok) throw new Error('Server unavailable');
      const {ips, port} = await response.json();
      let origin = location.origin;
      if (['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(location.hostname)) {
        if (!ips?.length) throw new Error('No LAN address');
        origin = 'http://' + ips[0] + ':' + port;
      }
      const urls = this.cards.map((card, who) => {
        const url = new URL('/controller.html', origin);
        url.search = new URLSearchParams({ room: this.room, player: String(who + 1) });
        const link = card.querySelector('.qr-url');
        link.href = url.href;
        link.hidden = false;
        return url.href;
      });
      await loadQrLibrary();
      this.cards.forEach((card, who) => {
        const qr = window.qrcode(0, 'M');
        qr.addData(urls[who]);
        qr.make();
        card.querySelector('.qr-img').innerHTML = qr.createImgTag(5, 16, 'P' + (who + 1) + ' QR');
      });
      this.ready = true;
      this.network.textContent = '';
    } catch {
      this.network.textContent = this.translate('phoneUnavailable');
    } finally {
      this.loading = false;
    }
  }
}

let qrPromise;
function loadQrLibrary() {
  if (window.qrcode) return Promise.resolve();
  qrPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = QR_LIB;
    script.onload = resolve;
    script.onerror = () => { qrPromise = null; script.remove(); reject(new Error('QR library unavailable')); };
    document.head.appendChild(script);
  });
  return qrPromise;
}
