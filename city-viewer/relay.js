// relay.js - passes messages between the phone controller and the game.
//
// No extra packages: uses plain HTTP.
//   Phone  --POST /api/input-->  server  --live stream-->  game   (driving)
//   Game   --POST /api/haptic--> server  --live stream-->  phone  (vibrate)
// The "live stream" is Server-Sent Events: the page opens /api/events and
// the server keeps the connection open, writing a line whenever there's news.
// GET /api/info tells the game this laptop's Wi-Fi address (for the QR code).

const os = require('os');
const { writePoliceReport } = require('./snowflake.js');

const clients = { game: new Set(), phone: new Set() };

/** Send an event to every open stream of one kind ('game' or 'phone'). */
function send(role, type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients[role]) res.write(msg);
}

// Keep the streams alive (some networks close quiet connections).
setInterval(() => {
  for (const set of Object.values(clients)) for (const res of set) res.write(': ping\n\n');
}, 15000);

function readJson(req, done) {
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 10000) req.destroy(); });
  req.on('end', () => { try { done(JSON.parse(body || '{}')); } catch { done(null); } });
}

/** This computer's local network addresses, home/hotspot ones first. */
function lanAddresses() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return ips.sort((a, b) => score(a) - score(b));
}

/** Handles /api/... requests. Returns true if it dealt with the request. */
function handle(req, res, port) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;

  if (url.pathname === '/api/events') {
    const role = url.searchParams.get('role') === 'phone' ? 'phone' : 'game';
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients[role].add(res);
    if (role === 'phone') send('game', 'phones', { count: clients.phone.size });
    req.on('close', () => {
      clients[role].delete(res);
      if (role === 'phone') send('game', 'phones', { count: clients.phone.size });
    });
    return true;
  }
  if (req.method === 'POST' && (url.pathname === '/api/input' || url.pathname === '/api/haptic')) {
    readJson(req, (data) => {
      if (data) {
        if (url.pathname === '/api/input') send('game', 'input', data);
        else send('phone', 'haptic', data);
      }
      res.writeHead(204);
      res.end();
    });
    return true;
  }
  if (req.method === 'POST' && url.pathname === '/api/report') {
    // Game finished: ask Snowflake Cortex for the police report (null = use the backup).
    readJson(req, async (stats) => {
      let text = null, error = null;
      try { text = await writePoliceReport(stats || {}); } catch (e) { error = e.message; console.log('Snowflake:', error); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text, error }));
    });
    return true;
  }
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ port, ips: lanAddresses() }));
    return true;
  }
  res.writeHead(404);
  res.end();
  return true;
}

module.exports = { handle };
