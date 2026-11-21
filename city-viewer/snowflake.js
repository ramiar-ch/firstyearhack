// snowflake.js - Snowflake Cortex writes the "Met Police incident report".
//
// How: we turn the match stats into a police INCIDENT LOG (one line per crash,
// delivery, police alert, time warp...), send it to Snowflake as rows, and
// Cortex's AI_SUMMARIZE_AGG function sums it up in its own words.
// (Trial accounts can't use AI_COMPLETE, but AI_SUMMARIZE_AGG works.)
//
// Uses Snowflake's SQL REST API with a Programmatic Access Token - no npm
// packages. Settings come from city-viewer/.env (NEVER commit it):
//   SNOWFLAKE_ACCOUNT=orgname-accountname
//   SNOWFLAKE_TOKEN=<programmatic access token>
//   SNOWFLAKE_WAREHOUSE=COMPUTE_WH
// No .env / no internet? We return null and the game shows a backup report.

const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env - fine */ }

/** Match stats -> lines of a police incident log. */
function incidentLog(s) {
  const lines = ['METROPOLITAN POLICE INCIDENT LOG, The Strand, London WC2, 02:00. Reporting officer: Sergeant Pemberton, who finds all of this deeply irregular.'];
  let minute = 1;
  const at = (text) => lines.push(`02:${String(minute++).padStart(2, '0')} ${text}`);
  const names = ['Suspect 1 (orange hatchback)', 'Suspect 2 (blue hatchback)'];
  const crashes = s.crashes || [0, 0], deliveries = s.deliveries || [0, 0];
  const places = ['Bush House', 'a lamp post outside King\'s College London', 'Somerset House', 'a bus stop on Aldwych', 'the Waterloo Bridge railings'];
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < Math.min(crashes[p], 4); i++) at(`${names[p]} collided with ${places[(i + p) % places.length]}.`);
    for (let i = 0; i < Math.min(deliveries[p], 3); i++) at(`${names[p]} completed a suspicious "delivery" and was paid five pounds.`);
  }
  if (s.policeAlerts) at('Police alert raised. Sirens deployed along the Strand.');
  if (s.warpsTo1997) at('A suspect entered a red telephone box and vanished. A witness insists the suspect reappeared in 1997.');
  at(`Total earnings recovered: ${s.money || 0} pounds. Enquiries ongoing. The sergeant requests a cup of tea.`);
  return lines;
}

async function writePoliceReport(stats) {
  const { SNOWFLAKE_ACCOUNT, SNOWFLAKE_TOKEN, SNOWFLAKE_WAREHOUSE } = process.env;
  if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_TOKEN) return null;

  const log = incidentLog(stats);
  // Each log line becomes a row; $$...$$ quotes text safely in SQL.
  const rows = log.map((l) => `($$${l.replaceAll('$$', '')}$$)`).join(',');
  const sql = `SELECT AI_SUMMARIZE_AGG(line) FROM (SELECT column1 AS line FROM VALUES ${rows})`;

  const res = await fetch(`https://${SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SNOWFLAKE_TOKEN}`,
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ statement: sql, timeout: 60, warehouse: SNOWFLAKE_WAREHOUSE }),
    signal: AbortSignal.timeout(25000),
  });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(json.message || `HTTP ${res.status}`);
  return { text: String(json.data[0][0]).trim(), log };
}

module.exports = { writePoliceReport };
