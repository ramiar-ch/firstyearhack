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

/** Turn a sentence into 1997 pager shorthand: "PG: BUSH HSE NW 110M". */
function pagerText(text) {
  return 'PG: ' + text.toUpperCase()
    .replace(/NORTH-WEST/g, 'NW').replace(/NORTH-EAST/g, 'NE').replace(/SOUTH-WEST/g, 'SW').replace(/SOUTH-EAST/g, 'SE')
    .replace(/NORTH/g, 'N').replace(/SOUTH/g, 'S').replace(/EAST/g, 'E').replace(/WEST/g, 'W')
    .replace(/ METRES/g, 'M').replace(/ABOUT /g, '').replace(/HOUSE/g, 'HSE').replace(/ STATION/g, ' STN')
    .replace(/[.,!]/g, '').replace(/ THE /g, ' ');
}

export class Dispatch {
  /** toLatLon(x, z) turns game metres into { lat, lon }. */
  constructor(toLatLon) {
    this.isRetro = () => false; // set by the game: true in 1997 (pager mode)
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
      : `Now deliver to ${place.name}: head ${dir}, about ${m} metres. No rush.`;
    this.show(text, viaSnowflake);
  }

  show(text, viaSnowflake) {
    // 1997: no GPS, no voice assistant - you get a PAGER message instead.
    const pager = this.isRetro();
    if (pager) text = pagerText(text);
    this.box.classList.toggle('pager', pager);
    this.box.querySelector('.d-head').textContent = pager ? '✉ PAGER · 1997' : viaSnowflake ? '❄ SNOWFLAKE DISPATCH' : 'DISPATCH';
    this.box.querySelector('.d-text').textContent = text;
    this.box.style.display = 'block';
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { this.box.style.display = 'none'; }, 9000);
    // Read it aloud (British voice if there is one) - but pagers can't talk.
    if (!pager) try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-GB');
      if (v) u.voice = v;
      u.lang = 'en-GB';
      speechSynthesis.speak(u);
    } catch { /* no speech */ }
    // And big on the phone controller.
    fetch('/api/phone-message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, pager }) }).catch(() => {});
  }
}
