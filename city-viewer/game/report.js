// game/report.js - counts what happened, then shows the "Met Police incident
// report" written live by Snowflake Cortex (via the server) and reads it out
// in a British voice. Backup text is used if Snowflake isn't available.

export class PoliceReport {
  constructor() {
    this.start = performance.now();
    this.stats = { crashes: [0, 0], deliveries: [0, 0], warpsTo1997: 0, policeAlerts: 0, players: 1 };
  }

  /** Remember an event. who = 0 (P1) or 1 (P2). */
  log(kind, who = 0) {
    const s = this.stats;
    if (kind === 'crash') s.crashes[who]++;
    if (kind === 'passed') s.deliveries[who]++;
    if (kind === 'warp') s.warpsTo1997++;
    if (kind === 'police') s.policeAlerts++;
  }

  async show(money) {
    if (this.overlay) return;
    const stats = { ...this.stats, money, minutesPlayed: Math.round((performance.now() - this.start) / 6000) / 10 };
    this.overlay = document.createElement('div');
    this.overlay.id = 'report';
    this.overlay.innerHTML = `<div class="r-card"><div class="r-head">METROPOLITAN POLICE · INCIDENT REPORT</div>
      <div class="r-ref">Ref: STRAND/${Math.floor(Math.random() * 9000 + 1000)} · Location: The Strand, WC2</div>
      <p class="r-text">Contacting Snowflake Cortex…</p><div class="r-foot"></div><div class="r-close">Press K to close</div></div>`;
    document.body.appendChild(this.overlay);

    let text = null, log = null, source = '❄ Summarised live by Snowflake Cortex (AI_SUMMARIZE_AGG) from this match';
    try {
      const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stats) });
      ({ text, log } = await res.json());
    } catch { /* server offline */ }
    if (!text) { text = backupReport(stats); log = null; source = 'Offline backup report (Snowflake not connected)'; }
    if (!this.overlay) return; // closed while waiting
    this.overlay.querySelector('.r-text').textContent = text;
    // The incident log Snowflake summarised, in small print underneath.
    if (log) {
      const ul = document.createElement('ul');
      ul.className = 'r-log';
      for (const line of log.slice(1)) { const li = document.createElement('li'); li.textContent = line; ul.appendChild(li); }
      this.overlay.querySelector('.r-text').after(ul);
    }
    this.overlay.querySelector('.r-foot').textContent = source;
    speak(text);
  }

  hide() {
    if (!this.overlay) return false;
    this.overlay.remove();
    this.overlay = null;
    speechSynthesis.cancel();
    return true;
  }
}

/** Read the report aloud with a British voice if the browser has one. */
function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.lang === 'en-GB');
    if (voice) u.voice = voice;
    u.lang = 'en-GB';
    u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch { /* no speech - fine */ }
}

function backupReport(s) {
  const crashes = s.crashes[0] + s.crashes[1];
  return `At approximately 02:00 hours, officers observed a vehicle conducting "deliveries" along the Strand. ` +
    `The driver collided with the architecture of central London ${crashes} time${crashes === 1 ? '' : 's'}, ` +
    `including what witnesses describe as "most of Bush House".` +
    (s.offGridSeconds > 1 ? ` For ${Math.round(s.offGridSeconds)} seconds there are no records of the suspect at all.` : '') +
    (s.warpsTo1997 ? ` When pursued, the suspect entered a red telephone box and vanished. A colleague reports the suspect reappeared in 1997. Enquiries are ongoing.` : ` The suspect was last seen heading towards King's College, muttering about deadlines.`) +
    ` Total earnings: £${s.money}. Recommended action: a stern talking-to and a cup of tea.`;
}
