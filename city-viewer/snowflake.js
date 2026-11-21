// snowflake.js - asks Snowflake Cortex to write the "Met Police incident report".
//
// Uses Snowflake's SQL REST API with a Programmatic Access Token (no npm
// packages needed). Settings come from city-viewer/.env (NEVER commit it):
//   SNOWFLAKE_ACCOUNT=abc12345.eu-west-2.aws   (the part before .snowflakecomputing.com)
//   SNOWFLAKE_TOKEN=<your programmatic access token>
//   SNOWFLAKE_WAREHOUSE=COMPUTE_WH
//   SNOWFLAKE_MODEL=mistral-large2             (optional)
// No .env / no internet? We return null and the game shows a backup report.

const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env - fine */ }

async function writePoliceReport(stats) {
  const { SNOWFLAKE_ACCOUNT, SNOWFLAKE_TOKEN, SNOWFLAKE_WAREHOUSE } = process.env;
  if (!SNOWFLAKE_ACCOUNT || !SNOWFLAKE_TOKEN) return null;
  const model = process.env.SNOWFLAKE_MODEL || 'mistral-large2';

  const prompt =
    'You are a dry, pompous Metropolitan Police sergeant in London. Write a short, funny incident report ' +
    '(max 90 words, 2 short paragraphs, no swearing, no real people) about this arcade driving game session ' +
    'around King\'s College London on the Strand at 2am. Mention the phone box time-warp to 1997 if it happened. ' +
    'Facts (JSON): ' + JSON.stringify(stats);
  // $$...$$ quotes the text safely in SQL (just make sure it doesn't contain $$).
  const sql = `SELECT SNOWFLAKE.CORTEX.COMPLETE('${model}', $$${prompt.replaceAll('$$', '')}$$)`;

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
  return String(json.data[0][0]).trim();
}

module.exports = { writePoliceReport };
