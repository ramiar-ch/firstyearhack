// Download the raw OpenStreetMap data used by the city viewer.
// Usage (Node 18+):  node tools/fetch-osm.js
// Writes tools/osm-raw/q1.json … q8.json (ignored by git). Then run process-osm.js.
const fs = require('fs');
const path = require('path');

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const queryDir = path.join(__dirname, 'queries');
const outDir = path.join(__dirname, 'osm-raw');
fs.mkdirSync(outDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchOne(name, query) {
  let wait = 15000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    for (const url of SERVERS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': 'city-3d-model/1.0', Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        });
        const text = await res.text();
        if (res.ok && text.trimStart().startsWith('{')) return text;
        console.log(`${name}: ${res.status} from ${url}`);
      } catch (e) {
        console.log(`${name}: ${e.message} from ${url}`);
      }
    }
    console.log(`${name}: all servers busy, retrying in ${wait / 1000}s`);
    await sleep(wait); wait *= 2;
  }
  throw new Error(`${name}: gave up`);
}

(async () => {
  const files = fs.readdirSync(queryDir).filter(f => f.endsWith('.overpassql')).sort();
  for (const f of files) {
    const name = path.basename(f, '.overpassql');
    const text = await fetchOne(name, fs.readFileSync(path.join(queryDir, f), 'utf8'));
    fs.writeFileSync(path.join(outDir, name + '.json'), text);
    console.log(`${name}: ok (${(text.length / 1048576).toFixed(1)} MB)`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
