// game/dispatch.js - "❄ Snowflake Dispatch": guides you through each mission step.
//
// Every time the target changes (pickup -> escape -> drop-off), we ask the
// server, which asks SNOWFLAKE's geospatial SQL (ST_DISTANCE / ST_AZIMUTH) for
// the real distance and compass direction. The instruction is then
//   - shown in a box on the laptop,
//   - read aloud in a British voice,
//   - sent big to the phone controller (so the judge knows where to go).
// If Snowflake can't be reached, we work the same thing out ourselves.

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export class Dispatch {
  /** toLatLon(x, z) turns game metres into { lat, lon }. */
  constructor(toLatLon) {
    this.toLatLon = toLatLon;
    this.box = document.createElement('div');
    this.box.id = 'dispatch';
    this.box.innerHTML = '<div class="d-head"></div><div class="d-text"></div>';
    document.body.appendChild(this.box);
    this.hideTimer = null;
    this.request = 0;
  }

  /**
   * stage: 'pickup' | 'escape' | 'dropoff'. from = player position, place = { name, x, z }.
   */
  async guide(stage, from, place, item) {
    const id = ++this.request; // ignore answers to older requests
    let route = null, viaSnowflake = false;
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.toLatLon(from.x, from.z), to: this.toLatLon(place.x, place.z) }),
      });
      route = (await res.json()).route;
      viaSnowflake = !!route;
    } catch { /* server offline */ }
    if (!route) {
      // Backup: straight-line distance + bearing computed here.
      const dx = place.x - from.x, dz = place.z - from.z;
      route = { metres: Math.round(Math.hypot(dx, dz)), bearing: (Math.atan2(dx, -dz) * 180) / Math.PI };
    }
    if (id !== this.request) return;

    const dir = compass(route.bearing), m = Math.max(10, Math.round(route.metres / 10) * 10);
    const text =
      stage === 'pickup' ? `Head ${dir}, about ${m} metres, to ${place.name}. Pick up ${item}.`
      : stage === 'escape' ? `The Met is onto you! The red phone box is ${dir}, ${m} metres away. Press E inside it. Or throw your weapon to block them.`
      : stage === 'update' ? `Keep going: ${place.name} is ${dir}, ${m} metres. Follow the arrow.`
      : stage === 'near' ? `Nearly there! ${place.name} is just ${dir} of you.`
      : `Now deliver to ${place.name}: head ${dir}, about ${m} metres. No rush.`;
    this.show(text, viaSnowflake);
  }

  show(text, viaSnowflake) {
    this.box.querySelector('.d-head').textContent = viaSnowflake ? '❄ SNOWFLAKE DISPATCH' : 'DISPATCH';
    this.box.querySelector('.d-text').textContent = text;
    this.box.style.display = 'block';
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { this.box.style.display = 'none'; }, 9000);
    // Read it aloud (British voice if there is one).
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-GB');
      if (v) u.voice = v;
      u.lang = 'en-GB';
      speechSynthesis.speak(u);
    } catch { /* no speech */ }
    // And big on the phone controller.
    fetch('/api/phone-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }).catch(() => {});
  }
}
