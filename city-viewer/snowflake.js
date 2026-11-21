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
  // Bind each incident as a text value in its own row.
  const rows = log.map(() => '(?)').join(',');
  const bindings = Object.fromEntries(log.map((value, i) => [i + 1, { type: 'TEXT', value }]));
  const sql = `SELECT AI_SUMMARIZE_AGG(line) FROM (SELECT column1 AS line FROM VALUES ${rows})`;

  const res = await fetch(`https://${SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SNOWFLAKE_TOKEN}`,
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ statement: sql, bindings, timeout: 60, warehouse: SNOWFLAKE_WAREHOUSE }),
    signal: AbortSignal.timeout(25000),
  });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(json.message || `HTTP ${res.status}`);
  return { text: String(json.data[0][0]).trim(), log };
}

/** Run one SQL statement through the REST API, return the first row. */
async function runSql(sql) {
  const { SNOWFLAKE_ACCOUNT, SNOWFLAKE_TOKEN, SNOWFLAKE_WAREHOUSE } = process.env;
  if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_TOKEN) return null;
  const res = await fetch(`https://${SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SNOWFLAKE_TOKEN}`,
      'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ statement: sql, timeout: 30, warehouse: SNOWFLAKE_WAREHOUSE }),
    signal: AbortSignal.timeout(8000), // guidance must be quick
  });
  const json = await res.json();
  if (!res.ok || !json.data) throw new Error(json.message || `HTTP ${res.status}`);
  return json.data[0];
}

/**
 * "Snowflake Dispatch": Snowflake's geospatial functions work out the real
 * distance (metres) and compass bearing from the player to the target.
 * from/to = { lat, lon }. Returns { metres, bearing } or null (no Snowflake).
 */
async function dispatchRoute(from, to) {
  const n = (v) => Number(v).toFixed(6); // numbers only - safe to put in SQL
  const a = `ST_MAKEPOINT(${n(from.lon)}, ${n(from.lat)})`, b = `ST_MAKEPOINT(${n(to.lon)}, ${n(to.lat)})`;
  const row = await runSql(`SELECT ROUND(ST_DISTANCE(${a}, ${b})), ROUND(DEGREES(ST_AZIMUTH(${a}, ${b})))`);
  return row ? { metres: Number(row[0]), bearing: Number(row[1]) } : null;
}

module.exports = { writePoliceReport, dispatchRoute };
